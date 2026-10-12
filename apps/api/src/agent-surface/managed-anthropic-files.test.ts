import { describe, expect, it, vi } from 'vitest';
import { createAnthropicManagedProvider } from './managed-provider-anthropic.js';
import { ManagedWorkspaceError } from './managed-workspace.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ARCHIVES = [
  { name: 'kit.tgz', bytes: new Uint8Array([1, 2, 3]) },
  { name: 'sources.tgz', bytes: new Uint8Array([4, 5]) },
];

function provider(fetchImpl: ReturnType<typeof vi.fn>) {
  return createAnthropicManagedProvider({
    apiKey: 'secret-key',
    model: 'm',
    agentId: 'agent_test',
    environmentId: 'env_test',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe('anthropic mounted workspace', () => {
  it('uploads each archive, mounts it, and deletes the originals once the session exists', async () => {
    let uploads = 0;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/files') && init.method === 'POST') return jsonResponse({ id: `file_${++uploads}` });
      if (url.includes('/v1/files/') && init.method === 'DELETE') return jsonResponse({});
      if (url.endsWith('/v1/sessions?beta=true')) return jsonResponse({ id: 'sess_ws', status: 'queued' });
      throw new Error(`unexpected request ${url}`);
    });
    const managed = provider(fetchImpl);
    expect(managed.workspaceArchiveDir).toBe('/mnt/session/uploads');

    await managed.startSession({ correlationId: '7', prompt: 'p', model: 'm', workspaceArchives: ARCHIVES });

    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    const upload = calls.find(([url]) => url.endsWith('/v1/files'))!;
    expect((upload[1].headers as Record<string, string>)['x-api-key']).toBe('secret-key');
    expect(upload[1].body).toBeInstanceOf(FormData);
    const session = calls.find(([url]) => url.includes('/v1/sessions'))!;
    expect(JSON.parse(String(session[1].body)).resources).toEqual([
      { type: 'file', file_id: 'file_1', mount_path: '/kit.tgz' },
      { type: 'file', file_id: 'file_2', mount_path: '/sources.tgz' },
    ]);
    await vi.waitFor(() => {
      const deleted = calls.filter(([, init]) => init.method === 'DELETE').map(([url]) => url.split('/').pop());
      expect(deleted.sort()).toEqual(['file_1', 'file_2']);
    });
  });

  it('refuses with a workspace error and leaves no file behind when one upload fails', async () => {
    let uploads = 0;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/files') && init.method === 'POST') {
        return ++uploads === 1 ? jsonResponse({ id: 'file_ok' }) : jsonResponse({ error: 'too big' }, 413);
      }
      if (url.includes('/v1/files/') && init.method === 'DELETE') return jsonResponse({});
      throw new Error(`unexpected request ${url}`);
    });

    await expect(
      provider(fetchImpl).startSession({ correlationId: '7', prompt: 'p', model: 'm', workspaceArchives: ARCHIVES }),
    ).rejects.toBeInstanceOf(ManagedWorkspaceError);
    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    expect(calls.some(([url]) => url.includes('/v1/sessions'))).toBe(false);
    expect(calls.filter(([, init]) => init.method === 'DELETE').map(([url]) => url)).toEqual([
      'https://api.anthropic.com/v1/files/file_ok',
    ]);
  });

  it('deletes the uploads and asks for a plain retry when the session refuses the mounts', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/files') && init.method === 'POST') return jsonResponse({ id: 'file_x' });
      if (url.includes('/v1/files/') && init.method === 'DELETE') return jsonResponse({});
      if (url.includes('/v1/sessions')) return jsonResponse({ error: 'bad' }, 400);
      throw new Error(`unexpected request ${url}`);
    });

    await expect(
      provider(fetchImpl).startSession({ correlationId: '7', prompt: 'p', model: 'm', workspaceArchives: ARCHIVES }),
    ).rejects.toBeInstanceOf(ManagedWorkspaceError);
    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    await vi.waitFor(() => expect(calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(2));
  });

  it('retries a delete the API answered with a server error', async () => {
    const deletes: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/files') && init.method === 'POST') return jsonResponse({ id: 'file_r' });
      if (url.includes('/v1/files/') && init.method === 'DELETE') {
        deletes.push(url);
        return deletes.length === 1 ? jsonResponse({ error: 'busy' }, 503) : jsonResponse({});
      }
      if (url.endsWith('/v1/sessions?beta=true')) return jsonResponse({ id: 'sess_r', status: 'queued' });
      throw new Error(`unexpected request ${url}`);
    });

    await provider(fetchImpl).startSession({
      correlationId: '7',
      prompt: 'p',
      model: 'm',
      workspaceArchives: [ARCHIVES[0]!],
    });
    await vi.waitFor(() => expect(deletes).toHaveLength(2));
    expect(new Set(deletes)).toEqual(new Set(['https://api.anthropic.com/v1/files/file_r']));
  });

  it('returns the created session without waiting on a hanging delete', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/files') && init.method === 'POST') return jsonResponse({ id: 'file_h' });
      if (url.includes('/v1/files/') && init.method === 'DELETE') return new Promise<Response>(() => {});
      if (url.endsWith('/v1/sessions?beta=true')) return jsonResponse({ id: 'sess_h', status: 'queued' });
      throw new Error(`unexpected request ${url}`);
    });

    const session = await provider(fetchImpl).startSession({
      correlationId: '7',
      prompt: 'p',
      model: 'm',
      workspaceArchives: [ARCHIVES[0]!],
    });
    expect(session.id).toBe('sess_h');
  });
});

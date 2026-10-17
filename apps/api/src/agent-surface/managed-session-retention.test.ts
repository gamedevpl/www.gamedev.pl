import { describe, expect, it } from 'vitest';
import { createAnthropicSessionJanitor } from './managed-session-retention.js';

const KEY = 'sk-ant-secret-key';
const CUTOFF = new Date('2026-09-01T00:00:00.000Z');
const OLD = '2026-08-01T00:00:00.000Z';
const NEW = '2026-09-15T00:00:00.000Z';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
}

function session(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'idle',
    created_at: OLD,
    agent: { id: 'agent_ours' },
    environment_id: 'env_other',
    ...overrides,
  };
}

function fakeApi(
  pages: Array<{ data: unknown[]; next_page?: string | null }>,
  deleteStatus: Record<string, number> = {},
) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, headers: init?.headers as Record<string, string> });
    if (method === 'DELETE') {
      const id = decodeURIComponent(url.split('/v1/sessions/')[1].split('?')[0]);
      const status = deleteStatus[id] ?? 200;
      if (status === -1) throw new Error('network down');
      return new Response(status === 200 ? '{}' : 'nope', { status });
    }
    const cursor = new URL(url).searchParams.get('page');
    const index = cursor ? Number(cursor.replace('cursor-', '')) : 0;
    return Response.json(pages[index]);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function janitor(fetchImpl: typeof fetch) {
  return createAnthropicSessionJanitor({
    apiKey: KEY,
    agentId: 'agent_ours',
    environmentId: 'env_ours',
    baseUrl: 'https://anthropic.test/',
    fetchImpl,
  });
}

const deletedIds = (calls: Call[]) =>
  calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/v1/sessions/')[1].split('?')[0]);

describe('createAnthropicSessionJanitor', () => {
  it('deletes only old, ours, idle or terminated sessions', async () => {
    const api = fakeApi([
      {
        data: [
          session('s_idle'),
          session('s_terminated', { status: 'terminated' }),
          session('s_env_match', { agent: 'agent_theirs', environment_id: 'env_ours' }),
          session('s_string_agent', { agent: 'agent_ours' }),
          session('s_running', { status: 'running' }),
          session('s_rescheduling', { status: 'rescheduling' }),
          session('s_no_status', { status: undefined }),
          session('s_new', { created_at: NEW }),
          session('s_bad_date', { created_at: 'yesterday' }),
          session('s_no_date', { created_at: undefined }),
          session('s_theirs', { agent: { id: 'agent_theirs' } }),
          { nope: true },
        ],
        next_page: null,
      },
    ]);

    const result = await janitor(api.fetchImpl).prune({ olderThan: CUTOFF, maxDeletes: 100 });

    expect(deletedIds(api.calls)).toEqual(['s_idle', 's_terminated', 's_env_match', 's_string_agent']);
    expect(result).toEqual({ scanned: 12, deleted: 4, failed: 0, pages: 1 });
  });

  it('follows next_page and sends the beta headers', async () => {
    const api = fakeApi([
      { data: [session('a')], next_page: 'cursor-1' },
      { data: [session('b')], next_page: 'cursor-2' },
      { data: [session('c')] },
    ]);

    const result = await janitor(api.fetchImpl).prune({ olderThan: CUTOFF, maxDeletes: 100 });

    expect(result).toEqual({ scanned: 3, deleted: 3, failed: 0, pages: 3 });
    const lists = api.calls.filter((c) => c.method === 'GET').map((c) => c.url);
    expect(lists).toEqual([
      'https://anthropic.test/v1/sessions?beta=true&limit=100',
      'https://anthropic.test/v1/sessions?beta=true&limit=100&page=cursor-1',
      'https://anthropic.test/v1/sessions?beta=true&limit=100&page=cursor-2',
    ]);
    expect(api.calls[1].url).toBe('https://anthropic.test/v1/sessions/a?beta=true');
    for (const call of api.calls) {
      expect(call.headers).toMatchObject({
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      });
      expect(call.url).not.toContain(KEY);
    }
  });

  it('stops at maxDeletes', async () => {
    const api = fakeApi([
      { data: [session('a'), session('b')], next_page: 'cursor-1' },
      { data: [session('c'), session('d')], next_page: 'cursor-2' },
      { data: [session('e')] },
    ]);

    const result = await janitor(api.fetchImpl).prune({ olderThan: CUTOFF, maxDeletes: 3 });

    expect(deletedIds(api.calls)).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ scanned: 3, deleted: 3, failed: 0, pages: 2 });
  });

  it('stops listing at maxPages', async () => {
    const api = fakeApi([
      { data: [session('a')], next_page: 'cursor-1' },
      { data: [session('b')], next_page: 'cursor-2' },
      { data: [session('c')] },
    ]);

    const result = await janitor(api.fetchImpl).prune({ olderThan: CUTOFF, maxDeletes: 100, maxPages: 2 });

    expect(result).toEqual({ scanned: 2, deleted: 2, failed: 0, pages: 2 });
  });

  it('counts 404 as deleted and other failures as failed', async () => {
    const api = fakeApi([{ data: [session('gone'), session('boom'), session('net'), session('ok')] }], {
      gone: 404,
      boom: 500,
      net: -1,
    });

    const result = await janitor(api.fetchImpl).prune({ olderThan: CUTOFF, maxDeletes: 100 });

    expect(result).toEqual({ scanned: 4, deleted: 2, failed: 2, pages: 1 });
  });

  it('throws on a failed list without leaking the key', async () => {
    const fetchImpl = (async () => new Response('denied', { status: 401 })) as typeof fetch;

    const error = await janitor(fetchImpl)
      .prune({ olderThan: CUTOFF, maxDeletes: 100 })
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain(KEY);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createManagedProvider, ManagedAgentError } from './managed-agent.js';
import { ANTHROPIC_VENDOR, createAnthropicManagedProvider } from './managed-provider-anthropic.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('anthropic managed provider', () => {
  it('registers itself under the vendor id the environment selects', () => {
    const provider = createManagedProvider(ANTHROPIC_VENDOR, { apiKey: 'k', model: 'test-model' });
    expect(provider.vendor).toBe(ANTHROPIC_VENDOR);
    expect(provider.model).toBe('test-model');
  });

  it('sends the credential and both betas, and never puts the key in a URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_1', status: 'queued' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'secret-key',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'test-model',
      outputPath: 'outputs',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('secret-key');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret-key');
    expect(headers['anthropic-beta']).toContain('managed-agents');
    expect(headers['anthropic-beta']).toContain('files-api');
  });

  it('sums cache reads into input tokens rather than under-reporting them', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: 'sess_1',
        status: 'completed',
        model: 'test-model',
        usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 25 },
      }),
    );
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await provider.getSession('sess_1');

    expect(session).toMatchObject({
      state: 'completed',
      vendorState: 'completed',
      usage: { inputTokens: 1_050, outputTokens: 25, model: 'test-model' },
    });
  });

  it('answers null for a session the vendor no longer has', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.getSession('gone')).toBeNull();
  });

  it('downloads each named output file scoped to the session', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/files?')) {
        return jsonResponse({
          data: [{ id: 'file_1', filename: 'games/comet-courier/game.ts' }, { id: 'file_2' }],
        });
      }
      return new Response('export {};', { status: 200 });
    });
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const outputs = await provider.listOutputs('sess_1');

    expect(outputs).toEqual([{ path: 'games/comet-courier/game.ts', content: 'export {};' }]);
    expect(fetchImpl.mock.calls[0][0]).toContain('scope_id=sess_1');
  });

  it('raises a typed error carrying the status when the vendor refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('over quota', { status: 429 }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      provider.startSession({ correlationId: '1', prompt: 'p', model: 'm', outputPath: 'outputs' }),
    ).rejects.toThrow(ManagedAgentError);
  });

  it('reports an enforced cancel, because a hosted sandbox really stops', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_1', status: 'cancelled' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.cancelSession('sess_1')).toEqual({ enforced: true });
  });
});

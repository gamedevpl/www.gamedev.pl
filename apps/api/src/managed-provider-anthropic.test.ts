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

  it('keeps a zero-token usage object so reconciliation can settle the session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_0', status: 'completed', usage: {} }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      agentId: 'agent_test',
      environmentId: 'env_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.getSession('sess_0')).toMatchObject({
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('sends the credential and both betas, and never puts the key in a URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_1', status: 'queued' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'secret-key',
      model: 'test-model',
      agentId: 'agent_test',
      environmentId: 'env_test',
      maxListCostCents: 125,
      vaultIds: ['vlt_test'],
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
    expect(url).toBe('https://api.anthropic.com/v1/sessions');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret-key');
    expect(headers['anthropic-beta']).toBe('managed-agents-2026-04-01');
    expect(JSON.parse(String(init.body))).toEqual({
      agent: {
        type: 'agent_with_overrides',
        id: 'agent_test',
        model: { id: 'test-model' },
      },
      environment_id: 'env_test',
      vault_ids: ['vlt_test'],
      budget: {
        type: 'limit',
        max_list_cost: { amount: '125', currency: 'USD' },
      },
      metadata: { correlation_id: '42' },
      initial_events: [{ type: 'user.message', content: [{ type: 'text', text: 'build it' }] }],
    });
  });

  it('overrides the configured agent for a system prompt and MCP server', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_1', status: 'running' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'test-model',
      agentId: 'agent_test',
      environmentId: 'env_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'test-model',
      outputPath: 'outputs',
      systemPrompt: 'Follow the game contract.',
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://example.test/mcp' }] },
    });

    const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(body.agent).toMatchObject({
      type: 'agent_with_overrides',
      system: 'Follow the game contract.',
      mcp_servers: [{ type: 'url', name: 'gamedevpl', url: 'https://example.test/mcp' }],
    });
    expect(body.agent.tools).toEqual([
      { type: 'agent_toolset_20260401' },
      { type: 'mcp_toolset', mcp_server_name: 'gamedevpl' },
    ]);
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
      agentId: 'agent_test',
      environmentId: 'env_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.getSession('gone')).toBeNull();
  });

  it('lists named output files with their sizes, and downloads none of them yet', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ id: 'file_1', filename: 'games/comet-courier/game.ts', size_bytes: 10 }, { id: 'file_2' }],
      }),
    );
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const refs = await provider.listOutputs('sess_1');

    expect(refs).toEqual([{ path: 'games/comet-courier/game.ts', handle: 'file_1', sizeBytes: 10 }]);
    expect(fetchImpl.mock.calls[0][0]).toContain('scope_id=sess_1');
    // One call: the listing. The caps decide what is worth fetching.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads one output by its handle, not by its path', async () => {
    const fetchImpl = vi.fn(async () => new Response('export {};', { status: 200 }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const content = await provider.readOutput('sess_1', { path: 'games/comet-courier/game.ts', handle: 'file_1' });

    expect(content).toBe('export {};');
    expect(fetchImpl.mock.calls[0][0]).toContain('/v1/files/file_1/content');
  });

  it('refuses to read an output the listing gave no handle for', async () => {
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(provider.readOutput('sess_1', { path: 'game.ts' })).rejects.toThrow(ManagedAgentError);
  });

  it('raises a typed error carrying the status when the vendor refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('over quota', { status: 429 }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'm',
      agentId: 'agent_test',
      environmentId: 'env_test',
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

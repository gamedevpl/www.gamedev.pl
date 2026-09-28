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
      usage: { unit: 'tokens', vendor: 'anthropic', inputTokens: 0, outputTokens: 0 },
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
    expect(url).toBe('https://api.anthropic.com/v1/sessions?beta=true');
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
      initial_events: [{ type: 'user.message', content: [{ type: 'text', text: 'build it' }] }],
    });
  });

  it('creates a per-round vault and returns its opaque lease', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/vaults')) return jsonResponse({ id: 'vlt_round' });
      if (url.endsWith('/credentials')) return jsonResponse({ id: 'cred_round' });
      if (url.endsWith('/v1/sessions?beta=true')) return jsonResponse({ id: 'sess_round', status: 'queued' });
      throw new Error(`unexpected request ${url}`);
    });
    const provider = createAnthropicManagedProvider({
      apiKey: 'secret-key',
      model: 'test-model',
      agentId: 'agent_test',
      environmentId: 'env_test',
      vaultIds: ['vlt_probe_only'],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'test-model',
      outputPath: 'outputs',
      mcpBearerCredential: { url: 'https://www.gamedev.pl/api/mcp', token: 'round-secret' },
    });

    expect(session.credentialRef).toBe('vlt_round');
    expect(JSON.parse(String((fetchImpl.mock.calls[1][1] as RequestInit).body))).toEqual({
      display_name: 'gamedev.pl round 42',
      auth: {
        type: 'static_bearer',
        mcp_server_url: 'https://www.gamedev.pl/api/mcp',
        token: 'round-secret',
      },
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[2][1] as RequestInit).body)).vault_ids).toEqual(['vlt_round']);
  });

  it('archives a round vault when the managed backend releases it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'vlt_round' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'secret-key',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.releaseCredential?.('vlt_round');

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/vaults/vlt_round/archive');
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('leaves the configured agent its own tools and servers', async () => {
    // Measured twice: an agent with nothing to call just goes idle.
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
    expect(body.agent).toMatchObject({ type: 'agent_with_overrides', system: 'Follow the game contract.' });
    expect(body.agent.tools).toBeUndefined();
    expect(body.agent.mcp_servers).toBeUndefined();
  });

  it('replaces them only when the caller asks for it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'sess_1', status: 'running' }));
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'test-model',
      agentId: 'agent_test',
      environmentId: 'env_test',
      overrideTools: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'test-model',
      outputPath: 'outputs',
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://example.test/mcp' }] },
    });

    const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(body.agent.mcp_servers).toEqual([{ type: 'url', name: 'gamedevpl', url: 'https://example.test/mcp' }]);
    expect(body.agent.tools).toEqual([
      { type: 'agent_toolset_20260401' },
      {
        type: 'mcp_toolset',
        mcp_server_name: 'gamedevpl',
        default_config: { permission_policy: { type: 'always_allow' } },
      },
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
      usage: { unit: 'tokens', vendor: 'anthropic', inputTokens: 1_050, outputTokens: 25, model: 'test-model' },
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

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createManagedProvider } from './managed-agent.js';
import { createGeminiManagedProvider, GEMINI_DEFAULT_MODEL, GEMINI_VENDOR } from './managed-provider-gemini.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function secret(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

describe('gemini managed provider', () => {
  it('registers itself and defaults to the current Flash model', () => {
    const provider = createManagedProvider(GEMINI_VENDOR, { apiKey: secret('api'), model: '' });
    expect(provider.vendor).toBe(GEMINI_VENDOR);
    expect(provider.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it('starts a background MCP interaction with per-round auth and a native budget', async () => {
    const apiKey = secret('api');
    const roundToken = secret('round');
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'interaction-1', status: 'queued' }));
    const provider = createGeminiManagedProvider({
      apiKey,
      model: 'gemini-test-model',
      budget: { unit: 'tokens', max: 12_345 },
      baseUrl: 'https://gemini.test/v1beta',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      systemPrompt: 'Use the kit.',
      model: 'gemini-test-model',
      outputPath: 'outputs',
      workspaceFiles: [{ path: 'games/comet-courier/game.ts', content: 'export {};' }],
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://www.gamedev.pl/api/mcp' }] },
      mcpBearerCredential: { url: 'https://www.gamedev.pl/api/mcp', token: roundToken },
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe('https://gemini.test/v1beta/interactions');
    expect(url).not.toContain(apiKey);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(apiKey);
    expect(body).toMatchObject({
      agent: 'antigravity-preview-05-2026',
      input: 'build it',
      background: true,
      store: true,
      system_instruction: 'Use the kit.',
      agent_config: { type: 'antigravity', model: 'gemini-test-model', max_total_tokens: '12345' },
    });
    expect(body.tools).toEqual([
      {
        type: 'mcp_server',
        name: 'gamedevpl',
        url: 'https://www.gamedev.pl/api/mcp',
        headers: { Authorization: `Bearer ${roundToken}` },
      },
    ]);
    expect(body.environment).toEqual({
      type: 'remote',
      sources: [{ type: 'inline', target: '/workspace/games/comet-courier/game.ts', content: 'export {};' }],
      network: { allowlist: [{ domain: 'www.gamedev.pl' }] },
    });
  });

  it('refreshes a named environment with the round MCP host allowlist', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'interaction-1', status: 'queued' }));
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      environmentId: 'environment-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'gemini-test-model',
      outputPath: 'outputs',
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://www.gamedev.pl/api/mcp' }] },
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).environment).toEqual({
      type: 'remote',
      environment_id: 'environment-test',
      network: { allowlist: [{ domain: 'www.gamedev.pl' }] },
    });
  });

  it('tracks an auto-created environment as the session workspace, for later cleanup', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 'interaction-1', status: 'queued', environment_id: 'auto-env-1' }),
    );
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'gemini-test-model',
      outputPath: 'outputs',
    });

    expect(session.workspace).toBe('auto-env-1');
  });

  it("never reports a caller-supplied named environment as this round's workspace", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 'interaction-1', status: 'queued', environment_id: 'environment-test' }),
    );
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      environmentId: 'environment-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'gemini-test-model',
      outputPath: 'outputs',
    });

    expect(session.workspace).toBeUndefined();
  });

  it('deletes the environment a round auto-created, and swallows a missing one', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.deleteWorkspace?.('auto-env-1');
    expect(fetchImpl.mock.calls[0][0]).toContain('/environments/auto-env-1');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });

    const notFound = vi.fn(async () => new Response(null, { status: 404 }));
    const providerMissing = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      fetchImpl: notFound as unknown as typeof fetch,
    });
    await expect(providerMissing.deleteWorkspace?.('already-gone')).resolves.toBeUndefined();
  });

  it('preserves Gemini usage fields and maps every documented interaction state', async () => {
    const statuses = [
      ['queued', 'queued'],
      ['in_progress', 'in_progress'],
      ['requires_action', 'in_progress'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
      ['incomplete', 'completed'],
      ['budget_exceeded', 'completed'],
    ] as const;
    for (const [vendorState, state] of statuses) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          id: 'interaction-1',
          status: vendorState,
          model: 'gemini-test-model',
          usage: {
            total_input_tokens: 11,
            total_output_tokens: 7,
            total_thought_tokens: 5,
            total_cached_tokens: 3,
            total_tool_use_tokens: 2,
            total_tokens: 25,
          },
        }),
      );
      const provider = createGeminiManagedProvider({
        apiKey: secret('api'),
        model: 'gemini-test-model',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const session = await provider.getSession('interaction-1');
      expect(session?.state).toBe(state);
      expect(session?.vendorState).toBe(vendorState);
      expect(session?.usage).toEqual({
        unit: 'tokens',
        vendor: 'gemini',
        model: 'gemini-test-model',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 25,
        thoughtTokens: 5,
        cachedTokens: 3,
        toolUseTokens: 2,
      });
      if (vendorState === 'incomplete' || vendorState === 'budget_exceeded') {
        expect(session?.stopReason).toBe('budget_reached');
      }
    }
  });

  it('cancels enforced interactions and has no session outputs', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'interaction-1', status: 'cancelled' }));
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.cancelSession('interaction-1')).toEqual({ enforced: true });
    expect(fetchImpl.mock.calls[0][0]).toContain('/interactions/interaction-1/cancel');
  });

  it('does not claim cancellation enforcement when the vendor did not confirm it', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const provider = createGeminiManagedProvider({
      apiKey: secret('api'),
      model: 'gemini-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.cancelSession('missing-interaction')).toEqual({ enforced: false });
  });
});

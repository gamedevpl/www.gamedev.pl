import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createManagedProvider } from './managed-agent.js';
import { createOpenAiManagedProvider, OPENAI_VENDOR } from './managed-provider-openai.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function secret(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

describe('openai managed provider', () => {
  it('registers itself', () => {
    const provider = createManagedProvider(OPENAI_VENDOR, { apiKey: secret('api'), model: 'gpt-test' });
    expect(provider.vendor).toBe(OPENAI_VENDOR);
    expect(provider.model).toBe('gpt-test');
  });

  it('starts a background MCP response with per-round auth, unattended tool approval and a native ceiling', async () => {
    const apiKey = secret('api');
    const roundToken = secret('round');
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'resp-1', status: 'queued' }));
    const provider = createOpenAiManagedProvider({
      apiKey,
      model: 'gpt-test-model',
      budget: { unit: 'tokens', max: 12_345 },
      baseUrl: 'https://openai.test/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      systemPrompt: 'Use the kit.',
      model: 'gpt-test-model',
      effort: 'high',
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://www.gamedev.pl/api/mcp' }] },
      mcpBearerCredential: { url: 'https://www.gamedev.pl/api/mcp', token: roundToken },
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe('https://openai.test/v1/responses');
    expect(url).not.toContain(apiKey);
    expect(String(init.body)).not.toContain(apiKey);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${apiKey}`);
    expect(body).toMatchObject({
      model: 'gpt-test-model',
      input: 'build it',
      background: true,
      store: true,
      instructions: 'Use the kit.',
      reasoning: { effort: 'high' },
      max_output_tokens: 12_345,
    });
    expect(body.tools).toEqual([
      {
        type: 'mcp',
        server_label: 'gamedevpl',
        server_url: 'https://www.gamedev.pl/api/mcp',
        require_approval: 'never',
        authorization: roundToken,
      },
    ]);
  });

  it('does not attach a bearer to an MCP endpoint the round credential is not for', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'resp-1', status: 'queued' }));
    const provider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '42',
      prompt: 'build it',
      model: 'gpt-test-model',
      tools: { mcpEndpoints: [{ name: 'gamedevpl', url: 'https://www.gamedev.pl/api/mcp' }] },
      mcpBearerCredential: { url: 'https://other.example/mcp', token: secret('round') },
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.tools[0]).not.toHaveProperty('authorization');
  });

  it('refuses seed files — there is no checkout to write them into', async () => {
    const provider = createOpenAiManagedProvider({ apiKey: secret('api'), model: 'gpt-test-model' });
    expect(provider.supportsSeedFiles).toBe(false);
    await expect(
      provider.startSession({
        correlationId: '1',
        prompt: 'build it',
        model: 'gpt-test-model',
        workspaceFiles: [{ path: 'games/x/game.ts', content: 'export {};' }],
      }),
    ).rejects.toThrow(/no workspace/);
  });

  it('maps every documented response status and preserves usage fields', async () => {
    const statuses = [
      ['queued', 'queued'],
      ['in_progress', 'in_progress'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
    ] as const;
    for (const [vendorState, state] of statuses) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          id: 'resp-1',
          status: vendorState,
          model: 'gpt-test-model',
          created_at: 1_700_000_000,
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 18,
            input_tokens_details: { cached_tokens: 3 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        }),
      );
      const provider = createOpenAiManagedProvider({
        apiKey: secret('api'),
        model: 'gpt-test-model',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const session = await provider.getSession('resp-1');
      expect(session?.state).toBe(state);
      expect(session?.vendorState).toBe(vendorState);
      expect(session?.startedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
      expect(session?.usage).toEqual({
        unit: 'tokens',
        vendor: 'openai',
        model: 'gpt-test-model',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        reasoningTokens: 5,
        cachedTokens: 3,
      });
    }
  });

  it('parses a normal response where OpenAI sends explicit nulls, not omitted fields', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: 'resp-1',
        status: 'in_progress',
        model: 'gpt-5.6-luna',
        created_at: 1_700_000_000,
        incomplete_details: null,
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          total_tokens: 7,
          input_tokens_details: null,
          output_tokens_details: null,
        },
      }),
    );
    const provider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await provider.getSession('resp-1');
    expect(session?.state).toBe('in_progress');
    expect(session?.stopReason).toBeUndefined();
    expect(session?.usage).toMatchObject({ inputTokens: 5, outputTokens: 2, totalTokens: 7 });
  });

  it('records a budget stop only when incomplete was caused by the token ceiling', async () => {
    const budgetFetch = vi.fn(async () =>
      jsonResponse({ id: 'resp-1', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
    );
    const budgetProvider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: budgetFetch as unknown as typeof fetch,
    });
    const budgetSession = await budgetProvider.getSession('resp-1');
    expect(budgetSession?.stopReason).toBe('budget_reached');

    const filterFetch = vi.fn(async () =>
      jsonResponse({ id: 'resp-1', status: 'incomplete', incomplete_details: { reason: 'content_filter' } }),
    );
    const filterProvider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: filterFetch as unknown as typeof fetch,
    });
    const filterSession = await filterProvider.getSession('resp-1');
    expect(filterSession?.stopReason).toBeUndefined();
  });

  it('cancels and reports enforcement honestly', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'resp-1', status: 'cancelled' }));
    const provider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.cancelSession('resp-1')).toEqual({ enforced: true });
    expect(fetchImpl.mock.calls[0][0]).toContain('/responses/resp-1/cancel');
  });

  it('does not throw when the session already finished before the cancel arrived', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: 'Cannot cancel a completed response.' } }, 400),
    );
    const provider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.cancelSession('resp-1')).resolves.toEqual({ enforced: false });
  });

  it('does not claim cancellation enforcement when the vendor did not confirm it', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const provider = createOpenAiManagedProvider({
      apiKey: secret('api'),
      model: 'gpt-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.cancelSession('missing-response')).toEqual({ enforced: false });
  });
});

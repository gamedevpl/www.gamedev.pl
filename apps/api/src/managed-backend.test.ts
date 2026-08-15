import { describe, expect, it, vi } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { normalizeManagedState, type ManagedAgentProvider, type ManagedSessionRequest } from './managed-agent.js';
import { createManagedBackend } from './managed-backend.js';

const ISSUE = 42;
const SLUG = 'comet-courier';
const TOOLS = { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] };

function brief(overrides: Partial<BuildBrief> = {}): BuildBrief {
  return {
    issueNumber: ISSUE,
    slug: SLUG,
    spec: 'Deliver parcels between comets while dodging debris.',
    channelToken: 'token',
    apiBaseUrl: 'https://example.test',
    ...overrides,
  };
}

function fakeProvider(overrides: Partial<ManagedAgentProvider> = {}) {
  const started: ManagedSessionRequest[] = [];
  let state: string = 'queued';
  let stopReason: string | undefined;
  const provider: ManagedAgentProvider = {
    vendor: 'fake',
    model: 'fake-model',
    startSession: async (request) => {
      started.push(request);
      return { id: 'session-1', state: 'queued' };
    },
    getSession: async () => ({
      id: 'session-1',
      // Adapters normalize before returning; the fake honours that contract.
      state: normalizeManagedState(state),
      usage: { unit: 'tokens', vendor: 'fake', inputTokens: 1_000, outputTokens: 250, model: 'fake-model' },
      ...(stopReason ? { stopReason } : {}),
    }),
    cancelSession: async () => ({ enforced: true }),
    deleteSession: async () => undefined,
    ...overrides,
  };
  return {
    provider,
    started,
    setState: (next: string) => {
      state = next;
    },
    setStopReason: (next: string | undefined) => {
      stopReason = next;
    },
  };
}

describe('managed backend', () => {
  it('names itself after the vendor so provenance survives a swap', () => {
    const { provider } = fakeProvider();
    const backend = createManagedBackend({ provider, tools: TOOLS });
    expect(backend.name).toBe('managed:fake');
  });

  it('refuses a configuration with no MCP endpoint', () => {
    const { provider } = fakeProvider();
    expect(() => createManagedBackend({ provider, tools: {} })).toThrow(/needs an MCP endpoint/);
  });

  it('dispatches over MCP; the agent submits for itself', async () => {
    const { provider, setState } = fakeProvider();
    const backend = createManagedBackend({ provider, tools: TOOLS });
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
  });

  it('mints a vault-only MCP credential and revokes it after agent end', async () => {
    const released: string[] = [];
    const info = vi.fn();
    const { provider, started, setState } = fakeProvider({
      startSession: async (request) => {
        started.push(request);
        return { id: 'session-1', state: 'queued', credentialRef: 'lease-1' };
      },
      releaseCredential: async (ref) => {
        released.push(ref);
      },
    });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      mcpBearerCredential: (input) => ({ url: 'https://www.gamedev.pl/api/mcp', token: input.channelToken }),
      readSignals: async () => ({ agentEndedAt: '2026-08-09T18:00:00.000Z' }),
      log: { warn: vi.fn(), info },
    });

    const result = await backend.dispatch(brief({ channelToken: 'round-token' }));
    setState('idle');
    await backend.observe(result.ref, { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(started[0].mcpBearerCredential).toEqual({ url: 'https://www.gamedev.pl/api/mcp', token: 'round-token' });
    expect(result.credentialRef).toBe('lease-1');
    expect(released).toEqual(['lease-1']);
    expect(info).toHaveBeenCalledWith(
      {
        issueNumber: ISSUE,
        slug: SLUG,
        ref: 'session-1',
        credentialRef: 'lease-1',
        mcpUrl: 'https://www.gamedev.pl/api/mcp',
      },
      'managed round credential minted',
    );
    expect(info).toHaveBeenCalledWith(
      { issueNumber: ISSUE, slug: SLUG, ref: 'session-1', credentialRef: 'lease-1' },
      'managed round credential revoked',
    );
  });

  it('sends the seed as workspace files and the digest as a cacheable prefix', async () => {
    const { provider, started } = fakeProvider({ supportsSeedFiles: true });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      systemPrompt: async () => 'KIT DIGEST',
      kitDigest: { load: async () => 'API EXAMPLES' },
    });

    await backend.dispatch(
      brief({ seed: { slug: SLUG, files: [{ path: 'game.ts', content: 'export {};' }], references: [] } }),
    );

    expect(started).toHaveLength(1);
    expect(started[0].systemPrompt).toBe('KIT DIGEST\n\n## Creator Kit digest\n\nAPI EXAMPLES');
    expect(started[0].model).toBe('fake-model');
    expect(started[0].correlationId).toBe(String(ISSUE));
    expect(started[0].workspaceFiles).toEqual([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
  });

  it('drops the seed instead of sending it to a provider that cannot accept workspace files', async () => {
    const { provider, started } = fakeProvider({ supportsSeedFiles: false });
    const backend = createManagedBackend({ provider, tools: TOOLS });

    await backend.dispatch(
      brief({ seed: { slug: SLUG, files: [{ path: 'game.ts', content: 'export {};' }], references: [] } }),
    );

    expect(started).toHaveLength(1);
    expect(started[0].workspaceFiles).toBeUndefined();
    // Must not claim a draft exists when none was sent.
    expect(started[0].prompt).not.toContain('already contains a generated first draft');
  });

  it('reports a seed the provider can read rather than one it cannot be handed', () => {
    const refuses = createManagedBackend({
      provider: fakeProvider({ supportsSeedFiles: false }).provider,
      tools: TOOLS,
    });
    // Cannot take files, but holds a key — still worth making.
    expect(refuses.seedDelivery?.()).toBe('channel');

    const accepts = createManagedBackend({
      provider: fakeProvider({ supportsSeedFiles: true }).provider,
      tools: TOOLS,
    });
    expect(accepts.seedDelivery?.()).toBe('workspace');
  });

  it('stops a Gemini session once native token usage exceeds the backend cap', async () => {
    const cancel = vi.fn(async () => ({ enforced: true }));
    const { provider } = fakeProvider({
      vendor: 'gemini',
      model: 'gemini-test-model',
      getSession: async () => ({
        id: 'session-1',
        state: 'in_progress',
        usage: {
          unit: 'tokens',
          vendor: 'gemini',
          model: 'gemini-test-model',
          inputTokens: 80,
          outputTokens: 30,
          totalTokens: 110,
          thoughtTokens: 10,
          cachedTokens: 4,
          toolUseTokens: 6,
        },
      }),
      cancelSession: cancel,
    });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      budget: { unit: 'tokens', max: 100 },
    });

    const first = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      state: 'cancelled',
      hasCandidate: false,
      sessionTokens: { vendor: 'gemini', total: 110 },
      budgetStop: { unit: 'tokens', observed: 110, max: 100, enforced: true },
    });
    expect(second).toMatchObject({ state: 'cancelled', hasCandidate: false, stopReason: 'budget_reached' });
  });

  it('cancels a session when the backend wall-clock limit expires', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(async () => ({ enforced: true }));
      const { provider, setState } = fakeProvider({
        vendor: 'gemini',
        model: 'gemini-test-model',
        cancelSession: cancel,
        getSession: async () => ({
          id: 'session-1',
          state: normalizeManagedState('in_progress'),
          usage: {
            unit: 'tokens',
            vendor: 'gemini',
            model: 'gemini-test-model',
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            thoughtTokens: 2,
            cachedTokens: 1,
            toolUseTokens: 1,
          },
        }),
      });
      const backend = createManagedBackend({
        provider,
        tools: TOOLS,
        maxDurationSeconds: 1,
      });

      await backend.dispatch(brief());
      setState('in_progress');
      vi.advanceTimersByTime(1_001);

      const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

      expect(cancel).toHaveBeenCalledWith('session-1');
      expect(observation).toMatchObject({ state: 'timed_out', hasCandidate: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a Copilot round once summed credits exceed its ceiling', async () => {
    const cancel = vi.fn(async () => ({ enforced: false }));
    const start = vi.fn();
    const { provider } = fakeProvider({
      startSession: async (request) => {
        start(request);
        return { id: 'copilot-task', state: 'queued' };
      },
      getSession: async () => ({
        id: 'copilot-task',
        state: 'in_progress',
        usage: { unit: 'credits', vendor: 'copilot', credits: 3.5, model: 'gpt-5.4' },
      }),
      cancelSession: cancel,
    });
    const backend = createManagedBackend({
      provider,
      budget: { unit: 'credits', max: 3 },
      tools: TOOLS,
    });

    await backend.dispatch(brief());
    const first = await backend.observe('copilot-task', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('copilot-task', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(first).toMatchObject({
      state: 'cancelled',
      stopReason: 'budget_reached',
      sessionCredits: 3.5,
      budgetStop: { unit: 'credits', observed: 3.5, max: 3, enforced: false },
    });
    expect(second).toMatchObject({ state: 'cancelled', stopReason: 'budget_reached' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('nudges an idle session once, then spends the round if still idle without delivery', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({ provider, tools: TOOLS });

    await backend.dispatch(brief());
    setState('idle');

    const first = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(first).toMatchObject({ state: 'in_progress', hasCandidate: false });
    // Spent nudge + still idle → completed (leave building).
    expect(second).toMatchObject({ state: 'completed', hasCandidate: false });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not nudge a round that delivered a preview but has no sealed version yet', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => ({ previewVersion: 'v20260809T071502153Z-9fbd2f' }),
    });

    await backend.dispatch(brief());
    setState('idle');
    await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not re-enter a session the agent deliberately ended', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => ({ agentEndedAt: '2026-08-09T07:15:08.000Z' }),
    });

    await backend.dispatch(brief());
    setState('idle');
    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(observation).toMatchObject({ state: 'idle' });
  });

  it('still nudges a session that went idle without delivering or ending', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => ({}),
    });

    await backend.dispatch(brief());
    setState('idle');
    const first = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('No delivery is recorded for this round');
    expect(first).toMatchObject({ state: 'in_progress' });
    expect(second).toMatchObject({ state: 'completed', hasCandidate: false });
  });

  it('ends a round blocked on tool confirmation instead of leaving Studio on building', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const warn = vi.fn();
    const { provider, setState, setStopReason } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => ({}),
      log: { warn },
    });

    await backend.dispatch(brief());
    setState('idle');
    setStopReason('requires_action');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ stopReason: 'requires_action' }),
      expect.stringMatching(/blocked on required action/),
    );
  });

  it('spends the round when a nudge is refused because the session awaits tool confirmation', async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error(
        'anthropic managed agents /v1/sessions/x/events failed: 400 only user.tool_confirmation events are allowed',
      );
    });
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => ({}),
      log: { warn: vi.fn() },
    });

    await backend.dispatch(brief());
    setState('idle');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
  });

  it('does not spend a nudged idle round that delivered a preview between polls', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const signals: { previewVersion?: string } = {};
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      readSignals: async () => signals,
    });

    await backend.dispatch(brief());
    setState('idle');
    await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    signals.previewVersion = 'v20260809T071502153Z-9fbd2f';
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ state: 'idle', hasCandidate: false });
  });

  it('reports an enforced stop, unlike a cooperative one', async () => {
    const { provider } = fakeProvider();
    const backend = createManagedBackend({ provider, tools: TOOLS });
    expect(await backend.cancel('session-1')).toEqual({ enforced: true });
  });

  it('archives round credentials even when interrupt fails', async () => {
    const releaseCredential = vi.fn(async () => undefined);
    const info = vi.fn();
    const { provider } = fakeProvider({
      startSession: async () => ({ id: 'session-1', state: 'queued', credentialRef: 'vault-1' }),
      cancelSession: async () => {
        throw new Error('interrupt unavailable');
      },
      releaseCredential,
    });
    const backend = createManagedBackend({
      provider,
      tools: TOOLS,
      log: { warn: vi.fn(), info },
    });

    await backend.dispatch(brief());
    await expect(backend.cancel('session-1')).rejects.toThrow(/interrupt unavailable/);
    expect(releaseCredential).toHaveBeenCalledWith('vault-1');
    // Cancel has no issueNumber arg; sessionJobs still correlates the revoke log.
    expect(info).toHaveBeenCalledWith(
      { issueNumber: ISSUE, slug: SLUG, ref: 'session-1', credentialRef: 'vault-1' },
      'managed round credential revoked',
    );
  });

  it('answers null for a session the vendor has forgotten', async () => {
    const { provider } = fakeProvider({ getSession: async () => null });
    const backend = createManagedBackend({ provider, tools: TOOLS });
    expect(await backend.observe('gone', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG })).toBeNull();
  });

  it('releases sandbox state on cleanup', async () => {
    const deleteSession = vi.fn(async () => undefined);
    const { provider } = fakeProvider({ deleteSession });
    const backend = createManagedBackend({ provider, tools: TOOLS });
    await backend.cleanup?.({ ref: 'session-1' });
    expect(deleteSession).toHaveBeenCalledWith('session-1');
  });

  it('deletes provider workspaces on cleanup', async () => {
    const deleteWorkspace = vi.fn(async () => undefined);
    const { provider } = fakeProvider({ deleteWorkspace });
    const backend = createManagedBackend({ provider, tools: TOOLS });

    await backend.cleanup?.({ ref: 'session-1', workspace: 'copilot/spent' });

    expect(deleteWorkspace).toHaveBeenCalledWith('copilot/spent');
  });
});

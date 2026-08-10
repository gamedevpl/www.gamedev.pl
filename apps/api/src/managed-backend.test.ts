import { describe, expect, it, vi } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import {
  normalizeManagedState,
  type ManagedAgentProvider,
  type ManagedOutputFile,
  type ManagedSessionRequest,
} from './managed-agent.js';
import { createManagedBackend, type ManagedDeliveryInput } from './managed-backend.js';

const ISSUE = 42;
const SLUG = 'comet-courier';

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
  const read: string[] = [];
  let state: string = 'queued';
  let stopReason: string | undefined;
  let outputs: ManagedOutputFile[] = [];
  let listedSizes = false;
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
      usage: { inputTokens: 1_000, outputTokens: 250 },
      ...(stopReason ? { stopReason } : {}),
    }),
    listOutputs: async () =>
      outputs.map((file) => ({
        path: file.path,
        handle: file.path,
        ...(listedSizes ? { sizeBytes: Buffer.byteLength(file.content, 'utf8') } : {}),
      })),
    readOutput: async (_sessionId, ref) => {
      read.push(ref.path);
      const match = outputs.find((file) => file.path === ref.handle);
      if (!match) throw new Error(`no such output: ${ref.path}`);
      return match.content;
    },
    cancelSession: async () => ({ enforced: true }),
    deleteSession: async () => undefined,
    ...overrides,
  };
  return {
    provider,
    started,
    read,
    setState: (next: string) => {
      state = next;
    },
    setStopReason: (next: string | undefined) => {
      stopReason = next;
    },
    setOutputs: (next: ManagedOutputFile[], options: { withSizes?: boolean } = {}) => {
      outputs = next;
      listedSizes = options.withSizes ?? false;
    },
  };
}

describe('managed backend', () => {
  it('names itself after the vendor so provenance survives a swap', () => {
    const { provider } = fakeProvider();
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });
    expect(backend.name).toBe('managed:fake');
  });

  it('refuses a configuration that can neither pull nor be submitted to', () => {
    const { provider } = fakeProvider();
    expect(() => createManagedBackend({ provider })).toThrow(/delivery sink or an MCP endpoint/);
  });

  it('accepts an MCP-only configuration, where the agent submits for itself', async () => {
    const { provider, setState, setOutputs, read } = fakeProvider();
    const backend = createManagedBackend({
      provider,
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
    });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    // Nothing is pulled: `submit_sources` is the delivery.
    expect(read).toEqual([]);
    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
  });

  it('prefers the MCP delivery contract when both delivery paths are configured', async () => {
    const { provider, started, setState, setOutputs, read } = fakeProvider();
    const backend = createManagedBackend({
      provider,
      deliver: async () => ({ version: 'v1' }),
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
    });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    await backend.dispatch(brief());
    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(started[0].prompt).toContain('Call `start`');
    expect(read).toEqual([]);
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
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
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
    const { provider, started } = fakeProvider();
    const backend = createManagedBackend({
      provider,
      deliver: async () => ({ version: 'v1' }),
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

  it('pulls the delivery once the session parks, and reports tokens not credits', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const delivered: ManagedDeliveryInput[] = [];
    const backend = createManagedBackend({
      provider,
      deliver: async (input) => {
        delivered.push(input);
        return { version: 'v1' };
      },
    });

    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);

    const running = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    expect(running).toMatchObject({ state: 'queued', hasCandidate: false });
    expect(delivered).toHaveLength(0);

    setState('status_idle');
    const parked = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    expect(parked).toMatchObject({ state: 'idle', hasCandidate: true, sessionTokens: { input: 1_000, output: 250 } });
    expect(parked?.sessionCredits).toBeUndefined();
    expect(delivered).toEqual([
      {
        issueNumber: ISSUE,
        slug: SLUG,
        sessionRef: 'session-1',
        backend: 'managed:fake',
        roundGeneration: 1,
        mode: 'preview',
        files: [{ path: 'game.ts', content: 'export {};' }],
      },
    ]);
  });

  it('uses the durable round generation from observe, not process memory', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const delivered: ManagedDeliveryInput[] = [];
    const backend = createManagedBackend({
      provider,
      deliver: async (input) => {
        delivered.push(input);
        return { version: 'v1' };
      },
    });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    await backend.observe('session-1', {
      hasCandidate: false,
      issueNumber: ISSUE,
      slug: SLUG,
      roundGeneration: 3,
    });

    expect(delivered[0]?.roundGeneration).toBe(3);
  });

  it('harvests at most once, however often the reconciler polls', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('does not deliver an empty harvest, so a stopped agent is not a candidate', async () => {
    const { provider, setState } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver });
    setState('failed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
    expect(observation).toMatchObject({ state: 'failed', hasCandidate: false });
  });

  it('refuses an oversized harvest instead of forwarding it, and does not retry', async () => {
    const { provider, setState, setOutputs, read } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const warn = vi.fn();
    const backend = createManagedBackend({ provider, deliver, log: { warn } });
    setOutputs(Array.from({ length: 61 }, (_, i) => ({ path: `games/${SLUG}/game/${i}.ts`, content: 'x' })));
    setState('completed');

    const first = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
    // The point of refusing on the listing: no bytes were ever pulled.
    expect(read).toEqual([]);
    expect(first).toMatchObject({ hasCandidate: false });
    expect(second).toMatchObject({ hasCandidate: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops what submit_sources would refuse, and still delivers the game', async () => {
    const { provider, setState, setOutputs, read } = fakeProvider();
    const delivered: ManagedDeliveryInput[] = [];
    const info = vi.fn();
    const backend = createManagedBackend({
      provider,
      deliver: async (input) => {
        delivered.push(input);
        return { version: 'v1' };
      },
      log: { warn: vi.fn(), info },
    });
    setOutputs([
      { path: `games/${SLUG}/game.ts`, content: 'export {};' },
      // Refused on upload, so not stored — but not worth failing.
      { path: `games/${SLUG}/media/cover.png`, content: 'not-a-png' },
      { path: `games/${SLUG}/.env`, content: 'SECRET=1' },
    ]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(observation).toMatchObject({ hasCandidate: true });
    expect(delivered[0].files.map((file) => file.path)).toEqual(['game.ts']);
    expect(read).toEqual([`games/${SLUG}/game.ts`]);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ ignored: [`games/${SLUG}/media/cover.png`, `games/${SLUG}/.env`] }),
      expect.stringContaining('not deliverable'),
    );
  });

  it('refuses a file the listing already says is too big, before downloading it', async () => {
    const { provider, setState, setOutputs, read } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver, log: { warn: vi.fn() } });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'x'.repeat(1_000_001) }], { withSizes: true });
    setState('completed');

    await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(read).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('refuses a file whose real bytes exceed what the listing claimed', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver, log: { warn: vi.fn() } });
    // No listed size, so only the bytes can be capped.
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'x'.repeat(1_000_001) }]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
  });

  it('does not report a settled session when it was the pull that failed', async () => {
    const { provider, setState } = fakeProvider({
      listOutputs: async () => {
        throw new Error('files API down');
      },
    });
    const warn = vi.fn();
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }), log: { warn } });
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    // `completed` with no candidate fails the job; our outage must not.
    expect(observation).toMatchObject({ state: 'in_progress', hasCandidate: false });
    expect(warn).toHaveBeenCalled();
  });

  it('waits rather than duplicating when another instance holds the delivery lock', async () => {
    const { provider, setState, setOutputs, read } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({
      provider,
      deliver,
      lock: { acquire: async () => false, release: async () => undefined },
    });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
    expect(read).toEqual([]);
    expect(observation).toMatchObject({ state: 'in_progress', hasCandidate: false });
  });

  it('cancels a session when the backend wall-clock limit expires', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(async () => ({ enforced: true }));
      const { provider, setState } = fakeProvider({ cancelSession: cancel });
      const backend = createManagedBackend({
        provider,
        deliver: async () => ({ version: 'v1' }),
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

  it('nudges an idle session once, then spends the round if still idle without delivery', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { provider, setState } = fakeProvider({ sendMessage });
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });

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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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
      tools: { mcpEndpoints: [{ url: 'https://example.test/api/mcp', name: 'gamedevpl' }] },
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

  it('releases the lock when delivery fails, so the retry is not locked out', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const release = vi.fn(async () => undefined);
    const backend = createManagedBackend({
      provider,
      deliver: async () => {
        throw new Error('gate unavailable');
      },
      lock: { acquire: async () => true, release },
      log: { warn: vi.fn() },
    });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(release).toHaveBeenCalledWith({ issueNumber: ISSUE, slug: SLUG, sessionRef: 'session-1' });
    expect(observation).toMatchObject({ state: 'in_progress', hasCandidate: false });
  });

  it('never harvests over a candidate that already exists', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    await backend.observe('session-1', { hasCandidate: true, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
  });

  it('cannot harvest without a job identity, and says so by not delivering', async () => {
    const { provider, setState, setOutputs } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const backend = createManagedBackend({ provider, deliver });
    setOutputs([{ path: `games/${SLUG}/game.ts`, content: 'export {};' }]);
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false });

    expect(deliver).not.toHaveBeenCalled();
    expect(observation).toMatchObject({ hasCandidate: false });
  });

  it('reports an enforced stop, unlike a cooperative one', async () => {
    const { provider } = fakeProvider();
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });
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
      deliver: async () => ({ version: 'v1' }),
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
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });
    expect(await backend.observe('gone', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG })).toBeNull();
  });

  it('releases sandbox state on cleanup', async () => {
    const deleteSession = vi.fn(async () => undefined);
    const { provider } = fakeProvider({ deleteSession });
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });
    await backend.cleanup?.({ ref: 'session-1' });
    expect(deleteSession).toHaveBeenCalledWith('session-1');
  });
});

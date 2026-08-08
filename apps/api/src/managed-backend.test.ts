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
  let state: string = 'queued';
  let outputs: ManagedOutputFile[] = [];
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
    }),
    listOutputs: async () => outputs,
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
    setOutputs: (next: ManagedOutputFile[]) => {
      outputs = next;
    },
  };
}

describe('managed backend', () => {
  it('names itself after the vendor so provenance survives a swap', () => {
    const { provider } = fakeProvider();
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }) });
    expect(backend.name).toBe('managed:fake');
  });

  it('sends the seed as workspace files and the digest as a cacheable prefix', async () => {
    const { provider, started } = fakeProvider();
    const backend = createManagedBackend({
      provider,
      deliver: async () => ({ version: 'v1' }),
      systemPrompt: async () => 'KIT DIGEST',
    });

    await backend.dispatch(
      brief({ seed: { slug: SLUG, files: [{ path: 'game.ts', content: 'export {};' }], references: [] } }),
    );

    expect(started).toHaveLength(1);
    expect(started[0].systemPrompt).toBe('KIT DIGEST');
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
        mode: 'preview',
        files: [{ path: 'game.ts', content: 'export {};' }],
      },
    ]);
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
    const { provider, setState, setOutputs } = fakeProvider();
    const deliver = vi.fn(async () => ({ version: 'v1' }));
    const warn = vi.fn();
    const backend = createManagedBackend({ provider, deliver, log: { warn } });
    setOutputs(Array.from({ length: 61 }, (_, i) => ({ path: `games/${SLUG}/game/${i}.ts`, content: 'x' })));
    setState('completed');

    const first = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });
    const second = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(deliver).not.toHaveBeenCalled();
    expect(first).toMatchObject({ hasCandidate: false });
    expect(second).toMatchObject({ hasCandidate: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps observing when a pull fails, so the next poll can retry', async () => {
    const { provider, setState } = fakeProvider({
      listOutputs: async () => {
        throw new Error('files API down');
      },
    });
    const warn = vi.fn();
    const backend = createManagedBackend({ provider, deliver: async () => ({ version: 'v1' }), log: { warn } });
    setState('completed');

    const observation = await backend.observe('session-1', { hasCandidate: false, issueNumber: ISSUE, slug: SLUG });

    expect(observation).toMatchObject({ state: 'completed', hasCandidate: false });
    expect(warn).toHaveBeenCalled();
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

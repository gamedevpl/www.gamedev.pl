import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeManagedState, type ManagedAgentProvider } from './managed-agent.js';
import { createManagedBackend, type ManagedRoundSignals } from './managed-backend.js';

const ISSUE = 42;
const TOOLS = { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] };
const BRIEF = {
  jobId: ISSUE,
  slug: 'comet-courier',
  spec: 'Deliver parcels.',
  channelToken: 't',
  apiBaseUrl: 'https://x.test',
};

// Dispatch, then observe once the one-second clock has passed.
async function observeAfterClock(state: string, signals: ManagedRoundSignals, startTakesMs = 0) {
  const cancelSession = vi.fn(async () => ({ enforced: true }));
  const provider: ManagedAgentProvider = {
    vendor: 'fake',
    model: 'fake-model',
    startSession: async () => {
      vi.advanceTimersByTime(startTakesMs);
      return { id: 'session-1', state: 'queued' };
    },
    getSession: async () => ({ id: 'session-1', state: normalizeManagedState(state) }),
    cancelSession,
    deleteSession: async () => undefined,
  };
  const backend = createManagedBackend({
    provider,
    tools: TOOLS,
    maxDurationSeconds: 1,
    nudgeIdle: false,
    readSignals: async () => signals,
  });
  await backend.dispatch(BRIEF);
  vi.advanceTimersByTime(1_001);
  const observation = await backend.observe('session-1', { hasCandidate: false, jobId: ISSUE, slug: 'comet-courier' });
  return { observation, cancelSession };
}

// Dispatch happens at T0; the clock is one second.
const T0 = Date.parse('2026-10-10T16:50:00.000Z');
const AFTER_START = '2026-10-10T16:50:00.500Z';
const BEFORE_START = '2026-10-10T16:49:00.000Z';

describe('managed backend wall clock on a finished idle round', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('leaves an idle session that delivered and called end to the gate', async () => {
    const { observation, cancelSession } = await observeAfterClock('idle', {
      previewVersion: 'v20261010T165000400Z-abc123',
      agentEndedAt: AFTER_START,
    });
    expect(cancelSession).not.toHaveBeenCalled();
    expect(observation?.state).not.toBe('timed_out');
  });

  it('counts an end the agent made while startSession was still resolving', async () => {
    const { cancelSession } = await observeAfterClock('idle', { agentEndedAt: AFTER_START }, 800);
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it('still times out an idle session that delivered nothing and never ended', async () => {
    const { observation, cancelSession } = await observeAfterClock('idle', {});
    expect(cancelSession).toHaveBeenCalledWith('session-1');
    expect(observation).toMatchObject({ state: 'timed_out' });
  });

  it('times out a repair session that inherited an earlier session’s end and delivery', async () => {
    const { observation } = await observeAfterClock('idle', {
      previewVersion: 'v20261010T164800000Z-old',
      agentEndedAt: BEFORE_START,
    });
    expect(observation).toMatchObject({ state: 'timed_out' });
  });

  it('still times out a session that keeps running past the clock', async () => {
    const { observation } = await observeAfterClock('in_progress', { agentEndedAt: AFTER_START });
    expect(observation).toMatchObject({ state: 'timed_out' });
  });
});

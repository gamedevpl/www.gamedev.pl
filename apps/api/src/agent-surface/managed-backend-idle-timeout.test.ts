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

// Delivered and ended, then idle past the wall clock.
async function observeAfterClock(state: string, signals: ManagedRoundSignals) {
  const cancelSession = vi.fn(async () => ({ enforced: true }));
  const provider: ManagedAgentProvider = {
    vendor: 'fake',
    model: 'fake-model',
    startSession: async () => ({ id: 'session-1', state: 'queued' }),
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

describe('managed backend wall clock on a finished idle round', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves an idle round that delivered a preview and ended to the gate', async () => {
    const { observation, cancelSession } = await observeAfterClock('idle', {
      previewVersion: 'v20261010T165200000Z-abc123',
      roundDeliveryCount: 1,
    });
    expect(cancelSession).not.toHaveBeenCalled();
    expect(observation?.state).not.toBe('timed_out');
  });

  it('leaves an idle round the agent ended to the gate', async () => {
    const { cancelSession } = await observeAfterClock('idle', { agentEndedAt: '2026-10-10T16:52:00.000Z' });
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it('times out a revision that only carries an earlier round’s versions', async () => {
    const { observation } = await observeAfterClock('idle', {
      previewVersion: 'v20261010T165200000Z-abc123',
      deliveredVersion: 'v20261009T120000000Z-def456',
      roundDeliveryCount: 0,
    });
    expect(observation).toMatchObject({ state: 'timed_out' });
  });

  it('still times out an idle round that delivered nothing and never ended', async () => {
    const { observation, cancelSession } = await observeAfterClock('idle', {});
    expect(cancelSession).toHaveBeenCalledWith('session-1');
    expect(observation).toMatchObject({ state: 'timed_out' });
  });

  it('still times out a session that keeps running past the clock', async () => {
    const { observation } = await observeAfterClock('in_progress', { agentEndedAt: '2026-10-10T16:52:00.000Z' });
    expect(observation).toMatchObject({ state: 'timed_out' });
  });
});

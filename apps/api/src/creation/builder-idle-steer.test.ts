import { describe, expect, it } from 'vitest';
import { shouldSteerFeedbackViaInbox } from './builder.js';

const idle = {
  state: 'building' as const,
  agentState: 'idle',
  agentStateRef: 'task-1',
  dispatch: { refs: ['task-1'] },
};

describe('shouldSteerFeedbackViaInbox on an idle managed session', () => {
  it('starts a new round instead of mailing a session that ended its turn', () => {
    expect(shouldSteerFeedbackViaInbox(idle)).toBe(false);
    const submitMarker = { agentEndedAt: '2026-11-25T22:01:00Z', agentEndedBy: 'submit' as const };
    expect(shouldSteerFeedbackViaInbox({ ...idle, ...submitMarker }, { stall: 'ended' })).toBe(false);
  });

  it('keeps steering when idle is stale, the session runs, or the builder is self', () => {
    // Idle from the previous session says nothing about this one.
    expect(shouldSteerFeedbackViaInbox({ ...idle, agentStateRef: 'task-0' })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ ...idle, agentState: 'in_progress' })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ ...idle, builder: 'self' })).toBe(true);
  });
});

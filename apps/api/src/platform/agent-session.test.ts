import { describe, expect, it } from 'vitest';
import { isAgentSessionEnded } from './agent-session.js';

describe('isAgentSessionEnded', () => {
  it('is false with no marker at all', () => {
    expect(isAgentSessionEnded({})).toBe(false);
    expect(isAgentSessionEnded({ agentState: 'in_progress' })).toBe(false);
  });

  it('is true for an agent that called end', () => {
    expect(isAgentSessionEnded({ agentEndedAt: '2026-09-12T10:00:00.000Z', agentEndedBy: 'end' })).toBe(true);
  });

  it('is false for a submit marker on a live session', () => {
    expect(
      isAgentSessionEnded({
        agentEndedAt: '2026-09-12T10:00:00.000Z',
        agentEndedBy: 'submit',
        agentState: 'in_progress',
      }),
    ).toBe(false);
  });

  it('is true for a submit marker once the vendor session is terminal', () => {
    for (const agentState of ['completed', 'failed', 'timed_out', 'cancelled']) {
      expect(
        isAgentSessionEnded({ agentEndedAt: '2026-09-12T10:00:00.000Z', agentEndedBy: 'submit', agentState }),
      ).toBe(true);
    }
  });

  it('treats a marker with no recorded author as an end', () => {
    expect(isAgentSessionEnded({ agentEndedAt: '2026-09-12T10:00:00.000Z' })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { uncollectedFeedbackCause } from './uncollected-feedback.js';

describe('uncollectedFeedbackCause', () => {
  it('blames the gate while it owes a verdict', () => {
    expect(uncollectedFeedbackCause({ state: 'submitted' })).toBe('awaiting_gate');
  });

  it('names the operator for a round parked on a publish decision', () => {
    expect(uncollectedFeedbackCause({ state: 'ready_for_review' })).toBe('awaiting_operator');
    expect(uncollectedFeedbackCause({ state: 'publishing' })).toBe('awaiting_operator');
  });

  it('reports an agent that ended before the message arrived', () => {
    expect(
      uncollectedFeedbackCause({
        state: 'building',
        lastAgentSignalAt: '2026-09-08T23:44:38.627Z',
        agentEndedAt: '2026-09-11T07:44:53.454Z',
      }),
    ).toBe('agent_ended');
  });

  it('reports a round no agent has ever connected to', () => {
    expect(uncollectedFeedbackCause({ state: 'dispatched' })).toBe('no_agent_yet');
    expect(uncollectedFeedbackCause({ state: 'queued' })).toBe('no_agent_yet');
  });

  it('keeps the original meaning when an agent is live and should have collected it', () => {
    expect(
      uncollectedFeedbackCause({ state: 'building', lastAgentSignalAt: '2026-09-12T10:00:00.000Z' }),
    ).toBe('agent_expected');
  });

  it('does not call a live round agentless just because it is mid-build', () => {
    expect(uncollectedFeedbackCause({ state: 'building' })).toBe('agent_expected');
  });
});

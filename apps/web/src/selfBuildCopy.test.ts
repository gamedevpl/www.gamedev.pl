import { describe, expect, it } from 'vitest';
import enLocale from './i18n/locales/en.json';
import plLocale from './i18n/locales/pl.json';
import { connectCardMode, selfComposerRoute, selfStatusCopy, shouldShowConnectCard } from './selfBuildCopy.js';

describe('selfStatusCopy', () => {
  it('is null for platform rounds', () => {
    expect(selfStatusCopy({ builder: 'platform', stall: 'quiet' })).toBeNull();
    expect(selfStatusCopy({ builder: 'platform', stall: 'no_agent_yet' })).toBeNull();
  });

  it('selects no_agent_yet before the first signal', () => {
    expect(selfStatusCopy({ builder: 'self', stall: 'no_agent_yet' })).toBe('no_agent_yet');
  });

  it('selects quiet_agent after a signal has gone silent', () => {
    expect(selfStatusCopy({ builder: 'self', stall: 'quiet' })).toBe('quiet_agent');
  });

  it('selects agent_ended when the agent called end', () => {
    expect(selfStatusCopy({ builder: 'self', stall: 'ended' })).toBe('agent_ended');
  });

  it('selects delivery_cap over stall when the round hit its ceiling', () => {
    expect(
      selfStatusCopy({
        builder: 'self',
        stall: 'quiet',
        failureReason: 'self_build_delivery_cap',
      }),
    ).toBe('delivery_cap');
    expect(
      selfStatusCopy({
        builder: 'platform',
        failureReason: 'self_build_delivery_cap',
      }),
    ).toBe('delivery_cap');
  });

  it('is null while a self round is progressing normally', () => {
    expect(selfStatusCopy({ builder: 'self', stall: null })).toBeNull();
    expect(selfStatusCopy({ builder: 'self' })).toBeNull();
  });
});

describe('shouldShowConnectCard', () => {
  it('shows for no-agent-yet and quiet self rounds', () => {
    expect(shouldShowConnectCard({ builder: 'self', stall: 'no_agent_yet' })).toBe(true);
    expect(shouldShowConnectCard({ builder: 'self', stall: 'quiet' })).toBe(true);
  });

  it('hides after agent ended — handoff, not reconnect', () => {
    expect(shouldShowConnectCard({ builder: 'self', stall: 'ended' })).toBe(false);
  });

  it('hides when the delivery cap is reached or the agent is active', () => {
    expect(
      shouldShowConnectCard({
        builder: 'self',
        stall: 'quiet',
        failureReason: 'self_build_delivery_cap',
      }),
    ).toBe(false);
    expect(shouldShowConnectCard({ builder: 'self', stall: null })).toBe(false);
    expect(shouldShowConnectCard({ builder: 'platform', stall: 'quiet' })).toBe(false);
  });

  it('hides after gate-green — even with a stale quiet stall (connect would 409)', () => {
    expect(shouldShowConnectCard({ builder: 'self', phase: 'ready_for_review' })).toBe(false);
    expect(shouldShowConnectCard({ builder: 'self', phase: 'ready_for_review', stall: 'quiet' })).toBe(false);
  });
});

describe('connectCardMode', () => {
  it('is setup before the first agent signal', () => {
    expect(connectCardMode({ builder: 'self', stall: 'no_agent_yet' })).toBe('setup');
  });

  it('is resume after quiet — not a full first-time install', () => {
    expect(connectCardMode({ builder: 'self', stall: 'quiet' })).toBe('resume');
  });

  it('is null when the connect card should not show', () => {
    expect(connectCardMode({ builder: 'self', stall: null })).toBeNull();
    expect(connectCardMode({ builder: 'self', phase: 'ready_for_review' })).toBeNull();
    expect(connectCardMode({ builder: 'platform', stall: 'quiet' })).toBeNull();
  });
});

describe('selfComposerRoute', () => {
  it('is null when the platform is building', () => {
    expect(selfComposerRoute({ builder: 'platform' })).toBeNull();
    expect(selfComposerRoute({})).toBeNull();
  });

  it('is active while a self agent has a recent signal', () => {
    expect(selfComposerRoute({ builder: 'self', stall: null })).toBe('active');
    expect(selfComposerRoute({ builder: 'self' })).toBe('active');
  });

  it('hides the composer before first signal; waits when quiet, ended, or at the delivery cap', () => {
    expect(selfComposerRoute({ builder: 'self', stall: 'no_agent_yet' })).toBeNull();
    expect(selfComposerRoute({ builder: 'self', stall: 'quiet' })).toBe('waiting');
    expect(selfComposerRoute({ builder: 'self', stall: 'ended' })).toBe('waiting');
    expect(
      selfComposerRoute({
        builder: 'self',
        failureReason: 'self_build_delivery_cap',
      }),
    ).toBe('waiting');
  });

  it('is waiting after a green gate closes the round, without a connect card', () => {
    expect(selfComposerRoute({ builder: 'self', phase: 'ready_for_review', stall: null })).toBe('waiting');
    expect(shouldShowConnectCard({ builder: 'self', phase: 'ready_for_review' })).toBe(false);
  });
});

// CP-2 confirmed this pair on a live failed round: the banner told the creator that
// sending feedback starts another round, while the helper directly beneath it said
// their agent would pick the note up on its next check-in. A creator could not tell
// whether they were starting something or feeding something already running.
//
// The helper is the accurate one — a gate_red self round stays open, and the agent
// resubmits on the same key — so the banner must not claim a new round begins.
describe('the failed-round card reads as one story', () => {
  const en = enLocale.statusView as {
    failure: Record<string, string>;
    feedback: Record<string, string>;
  };
  const pl = plLocale.statusView as {
    failure: Record<string, string>;
    feedback: Record<string, string>;
  };

  it('routes a failed self round to the composer that says the agent picks it up', () => {
    // Establishes that these two strings really do render together.
    expect(selfComposerRoute({ builder: 'self', failureReason: 'gate_red' })).toBe('active');
    expect(selfStatusCopy({ builder: 'self', stall: null })).toBeNull();
  });

  it('does not tell the creator they start a round the agent is already in', () => {
    expect(en.failure.gate_red).not.toMatch(/start another round/i);
    expect(pl.failure.gate_red).not.toMatch(/rozpocząć kolejną rundę/i);
    // Still has to say what to do, or removing the claim would just leave a dead end.
    expect(en.failure.gate_red).toMatch(/below/i);
    expect(en.feedback.routeSelfActive).toMatch(/picks this up/i);
  });
});

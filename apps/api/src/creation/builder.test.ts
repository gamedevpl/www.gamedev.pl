import { describe, expect, it } from 'vitest';
import {
  allowsCreatorBuilderHandoff,
  allowsSelfToPlatformHandoff,
  DEFAULT_SELF_BUILD_CONNECT_DAYS,
  DEFAULT_SELF_BUILD_DELIVERY_CAP,
  isActiveBuildRound,
  isBuilderKind,
  shouldSteerFeedbackViaInbox,
  selfBuildConnectDays,
  selfBuildDeliveryCap,
} from './builder.js';

describe('builder helpers', () => {
  it('recognises builder kinds', () => {
    expect(isBuilderKind('self')).toBe(true);
    expect(isBuilderKind('platform')).toBe(true);
    expect(isBuilderKind('copilot')).toBe(false);
  });

  it('requires an explicit creator stop for platform→self handoffs', () => {
    expect(
      allowsCreatorBuilderHandoff({
        currentBuilder: 'platform',
        requestedBuilder: 'self',
        stall: null,
      }),
    ).toBe(false);
    expect(
      allowsCreatorBuilderHandoff({
        currentBuilder: 'platform',
        requestedBuilder: 'self',
        stall: null,
        creatorRequested: true,
      }),
    ).toBe(true);
    expect(
      allowsCreatorBuilderHandoff({
        currentBuilder: 'self',
        requestedBuilder: 'platform',
        stall: 'ended',
      }),
    ).toBe(true);
  });

  it('allows idle self→platform handoffs mid-round', () => {
    expect(allowsSelfToPlatformHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'ended' })).toBe(
      true,
    );
    expect(allowsSelfToPlatformHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'quiet' })).toBe(
      true,
    );
    expect(
      allowsSelfToPlatformHandoff({
        currentBuilder: 'self',
        requestedBuilder: 'platform',
        stall: 'gate_not_started',
        agentEndedAt: '2026-08-04T00:00:00Z',
      }),
    ).toBe(true);
    expect(
      allowsSelfToPlatformHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'no_agent_yet' }),
    ).toBe(true);
    expect(allowsSelfToPlatformHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: null })).toBe(
      false,
    );
    expect(
      allowsSelfToPlatformHandoff({
        currentBuilder: 'self',
        requestedBuilder: 'platform',
        stall: null,
        creatorRequested: true,
      }),
    ).toBe(true);
    expect(
      allowsSelfToPlatformHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'gate_not_started' }),
    ).toBe(false);
    expect(allowsSelfToPlatformHandoff({ currentBuilder: 'platform', requestedBuilder: 'self', stall: 'quiet' })).toBe(
      false,
    );
    expect(allowsSelfToPlatformHandoff({ currentBuilder: 'platform', requestedBuilder: 'self', stall: 'ended' })).toBe(
      false,
    );
  });

  it('steers via inbox for in-flight rounds that already have a dispatch ref', () => {
    const withRef = { dispatch: { refs: ['task-1'] } };
    expect(shouldSteerFeedbackViaInbox({ state: 'queued', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'dispatched', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'building', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'submitted', ...withRef })).toBe(true);
    expect(
      shouldSteerFeedbackViaInbox({
        state: 'needs_changes',
        transitions: [{ to: 'needs_changes', at: 't', by: 'gate', reason: 'gate_red' }],
        ...withRef,
      }),
    ).toBe(true);
    // Builder handoff must resume, not mail the agent we are about to invalidate.
    expect(shouldSteerFeedbackViaInbox({ state: 'building', ...withRef }, { builderChanging: true })).toBe(false);
    expect(
      shouldSteerFeedbackViaInbox(
        { state: 'building', agentEndedAt: '2026-08-11T16:00:00Z', ...withRef },
        { stall: 'ended' },
      ),
    ).toBe(false);
    expect(
      shouldSteerFeedbackViaInbox(
        { state: 'submitted', agentEndedAt: '2026-08-11T16:00:00Z', agentEndedBy: 'submit', ...withRef },
        { stall: 'ended' },
      ),
    ).toBe(true);
    expect(
      shouldSteerFeedbackViaInbox(
        {
          state: 'submitted',
          agentEndedAt: '2026-08-11T16:00:00Z',
          agentEndedBy: 'submit',
          agentState: 'completed',
          ...withRef,
        },
        { stall: 'ended' },
      ),
    ).toBe(false);
    expect(shouldSteerFeedbackViaInbox({ state: 'building', ...withRef }, { stall: 'quiet' })).toBe(false);
    expect(shouldSteerFeedbackViaInbox({ state: 'dispatched', ...withRef }, { stall: 'not_dispatched' })).toBe(false);
    expect(
      shouldSteerFeedbackViaInbox(
        { state: 'building', builder: 'self', agentEndedAt: '2026-08-11T16:00:00Z', ...withRef },
        { stall: 'ended' },
      ),
    ).toBe(true);
    // Dispatch never landed — feedback must retry starting a session.
    expect(shouldSteerFeedbackViaInbox({ state: 'queued' })).toBe(false);
    expect(shouldSteerFeedbackViaInbox({ state: 'queued', dispatch: { refs: [] } })).toBe(false);
    // Round over — a revision is a new session. Publishing has already closed the round.
    expect(shouldSteerFeedbackViaInbox({ state: 'ready_for_review', ...withRef })).toBe(false);
    expect(shouldSteerFeedbackViaInbox({ state: 'publishing', ...withRef })).toBe(false);
    expect(shouldSteerFeedbackViaInbox({ state: 'failed', ...withRef })).toBe(false);
  });

  it('treats gate-red / kit_outdated needs_changes as an active round', () => {
    expect(
      isActiveBuildRound({
        state: 'needs_changes',
        transitions: [{ to: 'needs_changes', at: 't', by: 'gate', reason: 'gate_red' }],
      }),
    ).toBe(true);
    expect(
      isActiveBuildRound({
        state: 'needs_changes',
        transitions: [{ to: 'needs_changes', at: 't', by: 'gate', reason: 'kit_outdated' }],
      }),
    ).toBe(true);
    expect(
      isActiveBuildRound({
        state: 'needs_changes',
        transitions: [{ to: 'needs_changes', at: 't', by: 'operator', reason: 'rejected' }],
      }),
    ).toBe(false);
    expect(isActiveBuildRound({ state: 'building' })).toBe(true);
    expect(isActiveBuildRound({ state: 'failed' })).toBe(false);
  });

  it('reads connect and delivery caps from env with defaults', () => {
    delete process.env.SELF_BUILD_CONNECT_DAYS;
    delete process.env.SELF_BUILD_DELIVERY_CAP;
    expect(selfBuildConnectDays()).toBe(DEFAULT_SELF_BUILD_CONNECT_DAYS);
    expect(selfBuildDeliveryCap()).toBe(DEFAULT_SELF_BUILD_DELIVERY_CAP);
    process.env.SELF_BUILD_CONNECT_DAYS = '21';
    process.env.SELF_BUILD_DELIVERY_CAP = '5';
    expect(selfBuildConnectDays()).toBe(21);
    expect(selfBuildDeliveryCap()).toBe(5);
    delete process.env.SELF_BUILD_CONNECT_DAYS;
    delete process.env.SELF_BUILD_DELIVERY_CAP;
  });
});

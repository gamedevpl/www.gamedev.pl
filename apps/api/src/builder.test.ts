import { describe, expect, it } from 'vitest';
import {
  allowsQuietBuilderHandoff,
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

  it('allows only quiet self→platform handoffs mid-round', () => {
    expect(allowsQuietBuilderHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'quiet' })).toBe(
      true,
    );
    expect(
      allowsQuietBuilderHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'no_agent_yet' }),
    ).toBe(false);
    expect(allowsQuietBuilderHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: null })).toBe(
      false,
    );
    expect(
      allowsQuietBuilderHandoff({ currentBuilder: 'self', requestedBuilder: 'platform', stall: 'gate_not_started' }),
    ).toBe(false);
    expect(allowsQuietBuilderHandoff({ currentBuilder: 'platform', requestedBuilder: 'self', stall: 'quiet' })).toBe(
      false,
    );
  });

  it('steers via inbox for in-flight rounds that already have a dispatch ref', () => {
    const withRef = { dispatch: { refs: ['task-1'] } };
    expect(shouldSteerFeedbackViaInbox({ state: 'queued', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'dispatched', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'building', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'submitted', ...withRef })).toBe(true);
    expect(shouldSteerFeedbackViaInbox({ state: 'gating', ...withRef })).toBe(true);
    expect(
      shouldSteerFeedbackViaInbox({
        state: 'needs_changes',
        transitions: [{ to: 'needs_changes', at: 't', by: 'gate', reason: 'gate_red' }],
        ...withRef,
      }),
    ).toBe(true);
    // Builder handoff must resume, not mail the agent we are about to invalidate.
    expect(shouldSteerFeedbackViaInbox({ state: 'building', ...withRef }, { builderChanging: true })).toBe(false);
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

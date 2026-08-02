import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELF_BUILD_CONNECT_DAYS,
  DEFAULT_SELF_BUILD_DELIVERY_CAP,
  isActiveBuildRound,
  isBuilderKind,
  isLiveAgentSession,
  selfBuildConnectDays,
  selfBuildDeliveryCap,
} from './builder.js';

describe('builder helpers', () => {
  it('recognises builder kinds', () => {
    expect(isBuilderKind('self')).toBe(true);
    expect(isBuilderKind('platform')).toBe(true);
    expect(isBuilderKind('copilot')).toBe(false);
  });

  it('treats only queued/dispatched/building as a live agent session', () => {
    expect(isLiveAgentSession({ state: 'queued' })).toBe(true);
    expect(isLiveAgentSession({ state: 'dispatched' })).toBe(true);
    expect(isLiveAgentSession({ state: 'building' })).toBe(true);
    expect(isLiveAgentSession({ state: 'submitted' })).toBe(false);
    expect(isLiveAgentSession({ state: 'needs_changes' })).toBe(false);
    expect(isLiveAgentSession({ state: 'failed' })).toBe(false);
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

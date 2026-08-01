import { describe, expect, it } from 'vitest';
import { selfComposerRoute, selfStatusCopy, shouldShowConnectCard } from './selfBuildCopy.js';

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

  it('is waiting before first signal, when quiet, or at the delivery cap', () => {
    expect(selfComposerRoute({ builder: 'self', stall: 'no_agent_yet' })).toBe('waiting');
    expect(selfComposerRoute({ builder: 'self', stall: 'quiet' })).toBe('waiting');
    expect(
      selfComposerRoute({
        builder: 'self',
        failureReason: 'self_build_delivery_cap',
      }),
    ).toBe('waiting');
  });
});

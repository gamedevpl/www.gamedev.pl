import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearObserveFailures,
  noteObserveFailure,
  resetSessionCrashCounters,
  sessionCrashStall,
  sessionCrashTransition,
} from './session-crash.js';

const NOW = Date.parse('2026-08-23T00:00:00.000Z');

beforeEach(() => {
  resetSessionCrashCounters();
});

describe('noteObserveFailure', () => {
  it('does not trip on a single blip', () => {
    expect(noteObserveFailure('ref-1')).toBe(false);
  });

  it('trips on the second failure in a row', () => {
    noteObserveFailure('ref-1');
    expect(noteObserveFailure('ref-1')).toBe(true);
  });

  it('counts per ref, not globally', () => {
    noteObserveFailure('ref-1');
    expect(noteObserveFailure('ref-2')).toBe(false);
  });

  it('resets on a successful observe', () => {
    noteObserveFailure('ref-1');
    clearObserveFailures('ref-1');
    // A fresh single failure after a success is a blip again, not strike two.
    expect(noteObserveFailure('ref-1')).toBe(false);
  });
});

describe('sessionCrashTransition', () => {
  it('moves a live round to needs_changes with the right reason', () => {
    const transition = sessionCrashTransition('building', () => NOW);

    expect(transition).toMatchObject({ to: 'needs_changes', by: 'reconciler', reason: 'session_crashed' });
  });

  it('says nothing for a state that cannot reach needs_changes', () => {
    expect(sessionCrashTransition('published', () => NOW)).toBeNull();
  });
});

describe('sessionCrashStall', () => {
  it('reads the last transition, not merely the newest timestamp', () => {
    // A later write can carry an earlier `at`.
    expect(
      sessionCrashStall({
        state: 'needs_changes',
        transitions: [
          { to: 'needs_changes', at: '2026-08-23T00:05:00.000Z', by: 'gate', reason: 'gate_red' },
          { to: 'needs_changes', at: '2026-08-23T00:00:00.000Z', by: 'reconciler', reason: 'session_crashed' },
        ],
      }),
    ).toBe('session_crashed');
  });

  it('says nothing once the job has moved on', () => {
    expect(
      sessionCrashStall({
        state: 'building',
        transitions: [
          { to: 'needs_changes', at: '2026-08-23T00:00:00.000Z', by: 'reconciler', reason: 'session_crashed' },
        ],
      }),
    ).toBeNull();
  });
});

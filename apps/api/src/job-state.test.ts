import { describe, expect, it } from 'vitest';
import {
  canTransition,
  detectStall,
  fromSubmissionStatus,
  isTerminal,
  JOB_STATES,
  planObservedStatusTransition,
  reconcileAgentObservation,
  toSubmissionStatus,
  type JobState,
} from './job-state.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('job state projection', () => {
  it('maps every internal state to a creator-facing status', () => {
    // The status route's contract is the whole public surface here: an unmapped state
    // would reach the client as undefined rather than failing loudly.
    for (const state of JOB_STATES) {
      expect(toSubmissionStatus(state)).toBeTruthy();
    }
  });

  it('hides our own verification behind "building"', () => {
    // Whether the agent or our gate is doing the work is not the creator's business.
    expect(toSubmissionStatus('submitted')).toBe('building');
    expect(toSubmissionStatus('gating')).toBe('building');
    expect(toSubmissionStatus('building')).toBe('building');
  });

  it('keeps the existing vocabulary for terminal outcomes', () => {
    expect(toSubmissionStatus('published')).toBe('published');
    expect(toSubmissionStatus('canceled')).toBe('abandoned');
    expect(toSubmissionStatus('abandoned')).toBe('abandoned');
    // Lossy on purpose: the public vocabulary has no terminal failure yet.
    expect(toSubmissionStatus('failed')).toBe('needs_changes');
  });
});

describe('transition rules', () => {
  it('never lets a terminal job move again', () => {
    for (const state of JOB_STATES.filter(isTerminal)) {
      for (const target of JOB_STATES) {
        expect(canTransition(state, target)).toBe(false);
      }
    }
  });

  it('lets a failed bake fall back rather than stranding the job', () => {
    expect(canTransition('publishing', 'needs_changes')).toBe(true);
    expect(canTransition('publishing', 'published')).toBe(true);
  });

  it('routes a revision round back through the queue', () => {
    expect(canTransition('needs_changes', 'queued')).toBe(true);
    expect(canTransition('ready_for_review', 'needs_changes')).toBe(true);
  });
});

describe('reconcileAgentObservation', () => {
  it('advances a queued job as the agent picks it up', () => {
    expect(reconcileAgentObservation('queued', { state: 'queued', hasCandidate: false })).toEqual({
      to: 'dispatched',
      reason: 'task_queued',
    });
    expect(reconcileAgentObservation('dispatched', { state: 'in_progress', hasCandidate: false })?.to).toBe('building');
  });

  it('is idempotent — a repeat observation moves nothing', () => {
    // The reconciler runs on a timer, so this is the common case, not an edge case.
    expect(reconcileAgentObservation('building', { state: 'in_progress', hasCandidate: false })).toBeNull();
  });

  it('distinguishes a finished build from an agent that produced nothing', () => {
    expect(reconcileAgentObservation('building', { state: 'completed', hasCandidate: true })).toEqual({
      to: 'ready_for_review',
      reason: 'task_completed',
    });
    expect(reconcileAgentObservation('building', { state: 'completed', hasCandidate: false })).toEqual({
      to: 'failed',
      reason: 'task_completed_without_delivery',
    });
  });

  it('treats failure and timeout as distinct reasons for the same outcome', () => {
    expect(reconcileAgentObservation('building', { state: 'failed', hasCandidate: false })).toEqual({
      to: 'failed',
      reason: 'task_failed',
    });
    expect(reconcileAgentObservation('building', { state: 'timed_out', hasCandidate: false })).toEqual({
      to: 'failed',
      reason: 'task_timed_out',
    });
  });

  it('ignores agent lifecycle once the work has been delivered', () => {
    // A session reporting failure after a successful upload must not snatch the
    // candidate back from the gate or the reviewer.
    for (const state of ['submitted', 'gating', 'ready_for_review', 'publishing'] as JobState[]) {
      expect(reconcileAgentObservation(state, { state: 'failed', hasCandidate: true })).toBeNull();
      expect(reconcileAgentObservation(state, { state: 'completed', hasCandidate: true })).toBeNull();
    }
  });

  it('never resurrects a terminal job', () => {
    for (const state of JOB_STATES.filter(isTerminal)) {
      expect(reconcileAgentObservation(state, { state: 'in_progress', hasCandidate: false })).toBeNull();
    }
  });

  it('keeps an idle or input-blocked session in building', () => {
    expect(reconcileAgentObservation('dispatched', { state: 'idle', hasCandidate: false })?.to).toBe('building');
    expect(reconcileAgentObservation('building', { state: 'waiting_for_user', hasCandidate: false })).toBeNull();
  });
});

describe('planObservedStatusTransition', () => {
  const AT = '2026-07-30T12:00:00Z';

  it('adopts a legacy submission that has no state yet', () => {
    // Everything in flight today predates the job model; this is how those records join
    // the state machine without a migration.
    expect(planObservedStatusTransition(undefined, 'building', AT)).toEqual({
      to: 'building',
      at: AT,
      by: 'reconciler',
      reason: 'adopted_from_derived_status',
    });
  });

  it('writes nothing when the derivation agrees with the job', () => {
    // The usual case by far — a job is polled far more often than it moves.
    expect(planObservedStatusTransition('building', 'building', AT)).toBeNull();
  });

  it('records a genuine move', () => {
    expect(planObservedStatusTransition('building', 'in_review', AT)).toEqual({
      to: 'ready_for_review',
      at: AT,
      by: 'reconciler',
      reason: 'derived_from_github',
    });
  });

  it('refuses to drag a finished job backwards', () => {
    // A stale poll observing an old issue state must not un-publish a live game.
    expect(planObservedStatusTransition('published', 'building', AT)).toBeNull();
    expect(planObservedStatusTransition('canceled', 'building', AT)).toBeNull();
  });

  it('lets a precise actor override the default attribution', () => {
    expect(planObservedStatusTransition(undefined, 'queued', AT, 'creator')?.by).toBe('creator');
  });

  it('round-trips every public status through the internal vocabulary', () => {
    const statuses = ['queued', 'building', 'in_review', 'publishing', 'published', 'needs_changes'] as const;
    for (const status of statuses) {
      expect(toSubmissionStatus(fromSubmissionStatus(status))).toBe(status);
    }
  });
});

describe('detectStall', () => {
  it('reports nothing for a build that is visibly working', () => {
    // Slow is not stuck. A long build that keeps reporting must never read as stalled.
    expect(
      detectStall({ state: 'building', stateSince: ago(2 * HOUR), lastAgentSignalAt: ago(60_000), now: NOW }),
    ).toBeNull();
  });

  it('prefers what the agent says over what timestamps imply', () => {
    expect(
      detectStall({
        state: 'building',
        stateSince: ago(60_000),
        lastAgentSignalAt: ago(60_000),
        agentState: 'waiting_for_user',
        now: NOW,
      }),
    ).toBe('awaiting_input');
  });

  it('catches a job nobody ever picked up', () => {
    expect(detectStall({ state: 'queued', stateSince: ago(30 * 60_000), now: NOW })).toBe('not_dispatched');
    expect(detectStall({ state: 'queued', stateSince: ago(60_000), now: NOW })).toBeNull();
  });

  it('catches a session that died before saying anything', () => {
    // With no signal ever, silence is measured from when building started — otherwise
    // an agent that crashes on turn one would never look quiet.
    expect(detectStall({ state: 'building', stateSince: ago(HOUR), now: NOW })).toBe('quiet');
  });

  it('catches our own gate failing to start', () => {
    expect(detectStall({ state: 'submitted', stateSince: ago(HOUR), now: NOW })).toBe('gate_not_started');
  });

  it('says nothing about finished jobs', () => {
    expect(detectStall({ state: 'published', stateSince: ago(10 * HOUR), now: NOW })).toBeNull();
    expect(detectStall({ state: 'failed', stateSince: ago(10 * HOUR), now: NOW })).toBeNull();
  });
});

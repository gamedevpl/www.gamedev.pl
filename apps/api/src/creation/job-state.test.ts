import { describe, expect, it } from 'vitest';
import {
  canTransition,
  detectStall,
  fromSubmissionStatus,
  isTerminal,
  JOB_STATES,
  nextRoundGeneration,
  planObservedStatusTransition,
  reconcileAgentObservation,
  shouldAutoAbandonSelfRound,
  toSubmissionStatus,
  transitionClosesRound,
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

describe('round-closing transitions', () => {
  it('bumps generation on every closing outcome', () => {
    expect(transitionClosesRound({ to: 'ready_for_review', at: 't', by: 'gate', reason: 'gate_green' })).toBe(true);
    expect(transitionClosesRound({ to: 'needs_changes', at: 't', by: 'operator', reason: 'rejected' })).toBe(true);
    expect(transitionClosesRound({ to: 'canceled', at: 't', by: 'creator', reason: 'abandoned' })).toBe(true);
    expect(transitionClosesRound({ to: 'canceled', at: 't', by: 'operator', reason: 'operator_canceled' })).toBe(true);
    expect(transitionClosesRound({ to: 'abandoned', at: 't', by: 'system', reason: 'no_connect' })).toBe(true);
    expect(transitionClosesRound({ to: 'failed', at: 't', by: 'reconciler', reason: 'task_failed' })).toBe(true);
  });

  it('keeps the round open after a red gate so the session can repair', () => {
    expect(transitionClosesRound({ to: 'needs_changes', at: 't', by: 'gate', reason: 'gate_red' })).toBe(false);
    expect(transitionClosesRound({ to: 'needs_changes', at: 't', by: 'gate', reason: 'kit_outdated' })).toBe(false);
    expect(transitionClosesRound({ to: 'submitted', at: 't', by: 'agent', reason: 'sources_delivered' })).toBe(false);
    expect(transitionClosesRound({ to: 'building', at: 't', by: 'operator', reason: 'operator_retry' })).toBe(false);
  });

  it('initializes legacy jobs at 1 and increments thereafter', () => {
    expect(nextRoundGeneration(undefined)).toBe(1);
    expect(nextRoundGeneration(1)).toBe(2);
    expect(nextRoundGeneration(7)).toBe(8);
  });
});

describe('transition rules', () => {
  it('never lets a finished job move again', () => {
    // `failed` is the exception: terminal to the reconciler (isTerminal guards it),
    // but a creator's feedback can start another round — tested below.
    for (const state of JOB_STATES.filter(isTerminal).filter((s) => s !== 'failed')) {
      for (const target of JOB_STATES) {
        expect(canTransition(state, target)).toBe(false);
      }
    }
  });

  it('lets feedback after a dead round start another, without reopening it to observations', () => {
    // A dead round must not orphan the job — feedback after a failure *is* the retry.
    expect(canTransition('failed', 'building')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('failed', 'dispatched')).toBe(true);
    // But never forward past the retry: a failure cannot shortcut into review.
    expect(canTransition('failed', 'ready_for_review')).toBe(false);
    expect(canTransition('failed', 'published')).toBe(false);
    // And a late observation of the dead session still moves nothing.
    expect(reconcileAgentObservation('failed', { state: 'failed', hasCandidate: false })).toBeNull();
    expect(reconcileAgentObservation('failed', { state: 'in_progress', hasCandidate: false })).toBeNull();
  });

  it('lets a failed bake fall back rather than stranding the job', () => {
    expect(canTransition('publishing', 'needs_changes')).toBe(true);
    expect(canTransition('publishing', 'published')).toBe(true);
  });

  it('routes a revision round back through the queue', () => {
    expect(canTransition('needs_changes', 'queued')).toBe(true);
    expect(canTransition('ready_for_review', 'needs_changes')).toBe(true);
  });

  it('lets a green draft reopen into another build round before publish', () => {
    // Studio feedback and MCP continue_draft resume the same job; without this the
    // dispatch succeeds and the state stays ready_for_review forever.
    expect(canTransition('ready_for_review', 'building')).toBe(true);
    expect(canTransition('ready_for_review', 'queued')).toBe(true);
    expect(canTransition('ready_for_review', 'dispatched')).toBe(true);
    // Still no shortcut past moderation into a live game.
    expect(canTransition('ready_for_review', 'published')).toBe(false);
  });

  it('lets a new agent session start from mid-round states without claiming it is coding yet', () => {
    // Self→platform handoff and Copilot resume accept a task long before GitHub reports
    // `in_progress`. Forcing `building` at dispatch lied about that boot window.
    expect(canTransition('building', 'dispatched')).toBe(true);
    expect(canTransition('submitted', 'dispatched')).toBe(true);
  });

  // A gate-red round is not always over: `mustFixGate` tells the live session to fix the
  // cause and deliver again without a new dispatch. agent-channel records that upload
  // only when this holds, so refusing it stranded a game the agent had already repaired.
  it('lets a session repair a gate-red delivery without another round', () => {
    expect(canTransition('needs_changes', 'submitted')).toBe(true);
    // Still no way to skip the verification the redelivery exists to pass.
    expect(canTransition('needs_changes', 'ready_for_review')).toBe(false);
    expect(canTransition('needs_changes', 'publishing')).toBe(false);
    expect(canTransition('needs_changes', 'published')).toBe(false);
  });

  // The gate reports by writing its verdict to the version manifest, which we read on a
  // poll — so a delivered job goes straight from `submitted` to the outcome and is never
  // seen mid-gate. `gating` was that never-taken step, and while it was `submitted`'s
  // only exit the reconciler computed the right target, canTransition refused it, and
  // the job sat telling the creator the gate had never started for as long as they
  // watched. The state is gone; these are the exits that carry the delivery now.
  it('lets a delivered job reach the gate verdict directly', () => {
    expect(canTransition('submitted', 'ready_for_review')).toBe(true);
    expect(canTransition('submitted', 'needs_changes')).toBe(true);
    // But not a shortcut past the moderation boundary.
    expect(canTransition('submitted', 'published')).toBe(false);
    expect(canTransition('submitted', 'publishing')).toBe(false);
  });

  // The shape of the bug rather than the instance: any state a reconciler can compute a
  // target for has to be able to reach it. Read as "no state is a dead end that isn't
  // meant to be one" — every non-terminal state must have somewhere to go.
  it('gives every non-terminal state a way forward', () => {
    for (const state of JOB_STATES.filter((s) => !isTerminal(s))) {
      const forward = JOB_STATES.filter(
        (target) => target !== state && canTransition(state, target) && !['canceled', 'abandoned'].includes(target),
      );
      expect(forward.length, `${state} has no exit other than cancel/abandon`).toBeGreaterThan(0);
    }
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

  it('keeps a budget stop visible in the round transition', () => {
    expect(
      reconcileAgentObservation('building', {
        state: 'cancelled',
        hasCandidate: false,
        stopReason: 'budget_reached',
      }),
    ).toEqual({ to: 'canceled', reason: 'budget_reached' });
  });

  it('ignores agent lifecycle once the work has been delivered', () => {
    // A session reporting failure after a successful upload must not snatch the
    // candidate back from the gate or the reviewer.
    for (const state of ['submitted', 'ready_for_review', 'publishing'] as JobState[]) {
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

  it('does not erase a richer internal state that projects to the same public status', () => {
    // `submitted` reads as `building` to creators — a derived-status poll must not
    // yank the delivery back to `building` on that lossy match.
    expect(planObservedStatusTransition('submitted', 'building', AT)).toBeNull();
    expect(planObservedStatusTransition('failed', 'needs_changes', AT)).toBeNull();
    expect(planObservedStatusTransition('dispatched', 'queued', AT)).toBeNull();
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

  it('prefers MCP end over quiet, but not over a due gate_not_started', () => {
    expect(
      detectStall({
        state: 'building',
        stateSince: ago(60_000),
        lastAgentSignalAt: ago(30_000),
        agentEndedAt: ago(10_000),
        now: NOW,
      }),
    ).toBe('ended');
    // Fresh submit+end: still ended so Studio can hand off before the gate window.
    expect(
      detectStall({
        state: 'submitted',
        stateSince: ago(60_000),
        agentEndedAt: ago(5_000),
        now: NOW,
      }),
    ).toBe('ended');
    // Past the gate window: ops must see gate_not_started even after end.
    expect(
      detectStall({
        state: 'submitted',
        stateSince: ago(HOUR),
        agentEndedAt: ago(5_000),
        now: NOW,
      }),
    ).toBe('gate_not_started');
  });

  it('catches our own gate failing to start', () => {
    expect(detectStall({ state: 'submitted', stateSince: ago(HOUR), now: NOW })).toBe('gate_not_started');
  });

  it('says nothing about finished jobs', () => {
    expect(detectStall({ state: 'published', stateSince: ago(10 * HOUR), now: NOW })).toBeNull();
    expect(detectStall({ state: 'failed', stateSince: ago(10 * HOUR), now: NOW })).toBeNull();
  });

  it('exposes no_agent_yet for self rounds before the first channel signal', () => {
    expect(
      detectStall({
        state: 'dispatched',
        stateSince: ago(HOUR),
        builder: 'self',
        now: NOW,
      }),
    ).toBe('no_agent_yet');
    // Once the agent has spoken, ordinary quiet detection applies — including while
    // still `dispatched` (resume lands there until progress / in_progress).
    expect(
      detectStall({
        state: 'building',
        stateSince: ago(HOUR),
        lastAgentSignalAt: ago(HOUR),
        builder: 'self',
        now: NOW,
      }),
    ).toBe('quiet');
    expect(
      detectStall({
        state: 'dispatched',
        stateSince: ago(60_000),
        lastAgentSignalAt: ago(HOUR),
        builder: 'self',
        now: NOW,
      }),
    ).toBe('quiet');
    // Platform rounds keep the old not_dispatched / quiet vocabulary.
    expect(detectStall({ state: 'dispatched', stateSince: ago(HOUR), builder: 'platform', now: NOW })).toBe(
      'not_dispatched',
    );
  });
});

describe('shouldAutoAbandonSelfRound', () => {
  const DAY = 24 * HOUR;

  it('abandons only self rounds that never connected past the window', () => {
    expect(
      shouldAutoAbandonSelfRound({
        builder: 'self',
        roundOpenedAt: ago(15 * DAY),
        now: NOW,
        connectDays: 14,
      }),
    ).toBe(true);
    expect(
      shouldAutoAbandonSelfRound({
        builder: 'self',
        roundOpenedAt: ago(2 * DAY),
        now: NOW,
        connectDays: 14,
      }),
    ).toBe(false);
    expect(
      shouldAutoAbandonSelfRound({
        builder: 'self',
        lastAgentSignalAt: ago(15 * DAY),
        roundOpenedAt: ago(15 * DAY),
        now: NOW,
        connectDays: 14,
      }),
    ).toBe(false);
    expect(
      shouldAutoAbandonSelfRound({
        builder: 'platform',
        roundOpenedAt: ago(15 * DAY),
        now: NOW,
        connectDays: 14,
      }),
    ).toBe(false);
  });
});

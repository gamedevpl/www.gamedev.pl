import type { Firestore } from '@google-cloud/firestore';
import {
  nextRoundGeneration,
  transitionClosesRound,
  type AgentSessionTokens,
  type JobTransition,
} from '../../creation/job-state.js';
import {
  MAX_JOB_COSTS,
  applyMeasuredTokens,
  MAX_JOB_TRANSITIONS,
  JOB_ID_FLOOR,
  type JobSeedOutcome,
  type JobCostEntry,
} from '../records/dispatch.js';
import type { SubmissionRecord } from '../records/submission.js';
import { clearRoundSignals } from './rounds.js';

export interface DispatchStore {
  // Moves a job to transition.to, stamping stateSince and appending to history.
  recordJobTransition(jobId: number, transition: JobTransition): Promise<boolean>;

  // Appends a dispatch ref -- which backend is building this job, and where.
  recordDispatch(
    jobId: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void>;

  // Appends one billed thing to the job's ledger; best-effort.
  recordJobCost(jobId: number, entry: JobCostEntry): Promise<void>;

  // Records what a seeded build's draft achieved.
  recordSeedOutcome(jobId: number, outcome: JobSeedOutcome): Promise<void>;

  // Every seed outcome recorded at or after `since`, newest first.
  listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]>;

  // Overwrites credits on an existing agent_session ledger entry; no-op if absent.
  setJobCostCredits(jobId: number, ref: string, credits: number): Promise<void>;

  // Token-billed twin of setJobCostCredits; drops the credit placeholder.
  setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void>;

  // Records where a dispatched job's work actually lives.
  setDispatchWorkspace(jobId: number, workspace: string): Promise<void>;

  // Forgets a released seed branch, so nothing tries to delete it twice.
  clearDispatchSeedWorkspace(jobId: number): Promise<void>;

  // Allocates a job id of our own, from JOB_ID_FLOOR upward.
  allocateJobId(): Promise<number>;

  claimDispatchReaperAttempt(jobId: number, at: string): Promise<boolean>;
}

export class InMemoryDispatchStore implements DispatchStore {
  private nextJobId = JOB_ID_FLOOR;

  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async recordJobTransition(jobId: number, transition: JobTransition): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub) return false;
    // Idempotent for identical arrivals; a new reason wins only for the operator.
    if (sub.state === transition.to) {
      const last = sub.transitions?.at(-1);
      if (last?.to === transition.to && last?.reason === transition.reason) return false;
      if (transition.by !== 'operator') return false;
    }
    const closes = transitionClosesRound(transition);
    const next: SubmissionRecord = {
      ...sub,
      state: transition.to,
      stateSince: transition.at,
      transitions: [...(sub.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
      ...(closes
        ? {
            roundGeneration: nextRoundGeneration(sub.roundGeneration),
            roundDeliveryCount: 0,
            roundTypecheckPreflightRefusals: 0,
            roundSubmitAttempts: 0,
            roundPreflightRefusalsAudio: 0,
            roundPreflightRefusalsSymbols: 0,
            roundStartedAt: transition.at,
          }
        : {}),
    };
    if (closes) clearRoundSignals(next);
    this.submissions.set(jobId, next);
    return true;
  }

  async allocateJobId(): Promise<number> {
    this.nextJobId = Math.max(this.nextJobId, JOB_ID_FLOOR) + 1;
    return this.nextJobId;
  }

  async recordDispatch(
    jobId: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const existing = sub.dispatch;
    this.submissions.set(jobId, {
      ...sub,
      dispatch: {
        backend: dispatch.backend,
        refs: [...(existing?.refs ?? []), dispatch.ref],
        ...(dispatch.credentialRef
          ? { credentialRefs: { ...existing?.credentialRefs, [dispatch.ref]: dispatch.credentialRef } }
          : {}),
        workspace: dispatch.workspace ?? existing?.workspace,
        seedWorkspace: dispatch.seedWorkspace ?? existing?.seedWorkspace,
      },
    });
  }

  async clearDispatchSeedWorkspace(jobId: number): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.dispatch) return;
    const dispatch = { ...sub.dispatch };
    delete dispatch.seedWorkspace;
    this.submissions.set(jobId, { ...sub, dispatch });
  }

  async recordSeedOutcome(jobId: number, outcome: JobSeedOutcome): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    this.submissions.set(jobId, { ...sub, seedOutcome: outcome });
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    return [...this.submissions.values()]
      .map((sub) => sub.seedOutcome)
      .filter((outcome): outcome is JobSeedOutcome => Boolean(outcome) && outcome!.at >= since)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async recordJobCost(jobId: number, entry: JobCostEntry): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    this.submissions.set(jobId, {
      ...sub,
      costs: [...(sub.costs ?? []), entry].slice(-MAX_JOB_COSTS),
    });
  }

  async setJobCostCredits(jobId: number, ref: string, credits: number): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.costs?.length) return;
    let changed = false;
    const costs = sub.costs.map((entry) => {
      if (entry.kind !== 'agent_session' || entry.ref !== ref || entry.creditsMeasured) return entry;
      changed = true;
      return { ...entry, credits, creditsMeasured: true };
    });
    if (!changed) return;
    this.submissions.set(jobId, { ...sub, costs });
  }

  async setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.costs?.length) return;
    const costs = applyMeasuredTokens(sub.costs, ref, tokens);
    if (!costs) return;
    this.submissions.set(jobId, { ...sub, costs });
  }

  async setDispatchWorkspace(jobId: number, workspace: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.dispatch) return;
    this.submissions.set(jobId, { ...sub, dispatch: { ...sub.dispatch, workspace } });
  }

  async claimDispatchReaperAttempt(jobId: number, at: string): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub || sub.state !== 'queued' || sub.dispatchReaperAttemptedAt || (sub.dispatch?.refs?.length ?? 0) > 0) {
      return false;
    }
    this.submissions.set(jobId, { ...sub, dispatchReaperAttemptedAt: at });
    return true;
  }
}

export class FirestoreDispatchStore implements DispatchStore {
  constructor(private db: Firestore) {}

  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  async recordJobTransition(jobId: number, transition: JobTransition): Promise<boolean> {
    const ref = this.ref(jobId);
    // Transactional -- a concurrent poll and sweep could otherwise drop one write.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      // Same race as InMemoryDispatchStore -- a new reason wins only for the operator.
      if (current.state === transition.to) {
        const last = current.transitions?.at(-1);
        if (last?.to === transition.to && last?.reason === transition.reason) return false;
        if (transition.by !== 'operator') return false;
      }
      const closes = transitionClosesRound(transition);
      if (closes) {
        const next: SubmissionRecord = {
          ...current,
          state: transition.to,
          stateSince: transition.at,
          transitions: [...(current.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
          roundGeneration: nextRoundGeneration(current.roundGeneration),
          roundDeliveryCount: 0,
          roundTypecheckPreflightRefusals: 0,
          roundSubmitAttempts: 0,
          roundPreflightRefusalsAudio: 0,
          roundPreflightRefusalsSymbols: 0,
          roundStartedAt: transition.at,
        };
        clearRoundSignals(next);
        tx.set(ref, next);
      } else {
        tx.set(
          ref,
          {
            state: transition.to,
            stateSince: transition.at,
            transitions: [...(current.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
          },
          { merge: true },
        );
      }
      return true;
    });
  }

  async allocateJobId(): Promise<number> {
    const ref = this.db.collection('counters').doc('jobs');
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { next?: number } | undefined)?.next ?? JOB_ID_FLOOR;
      const next = Math.max(current, JOB_ID_FLOOR) + 1;
      tx.set(ref, { next }, { merge: true });
      return next;
    });
  }

  async recordDispatch(
    jobId: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    const ref = this.ref(jobId);
    // Transactional -- a dispatch and a reconciler observation could land together.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      tx.set(
        ref,
        {
          dispatch: {
            backend: dispatch.backend,
            refs: [...(existing?.refs ?? []), dispatch.ref],
            ...(dispatch.credentialRef
              ? { credentialRefs: { ...existing?.credentialRefs, [dispatch.ref]: dispatch.credentialRef } }
              : {}),
            ...((dispatch.workspace ?? existing?.workspace)
              ? { workspace: dispatch.workspace ?? existing?.workspace }
              : {}),
            ...((dispatch.seedWorkspace ?? existing?.seedWorkspace)
              ? { seedWorkspace: dispatch.seedWorkspace ?? existing?.seedWorkspace }
              : {}),
          },
        },
        { merge: true },
      );
    });
  }

  async recordSeedOutcome(jobId: number, outcome: JobSeedOutcome): Promise<void> {
    // A plain merge -- one writer, once per job, nothing here to race.
    await this.ref(jobId).set({ seedOutcome: outcome }, { merge: true });
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    // A real range query -- map subfields auto-index in Firestore.
    const snap = await this.db
      .collection('submissions')
      .where('seedOutcome.at', '>=', since)
      .orderBy('seedOutcome.at', 'desc')
      .get();
    return snap.docs
      .map((d) => (d.data() as SubmissionRecord).seedOutcome)
      .filter((outcome): outcome is JobSeedOutcome => Boolean(outcome));
  }

  async recordJobCost(jobId: number, entry: JobCostEntry): Promise<void> {
    const ref = this.ref(jobId);
    // Transactional -- two rounds can be charged in the same second.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      tx.set(ref, { costs: [...existing, entry].slice(-MAX_JOB_COSTS) }, { merge: true });
    });
  }

  async setJobCostCredits(jobId: number, ref: string, credits: number): Promise<void> {
    const docRef = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      let changed = false;
      const costs = existing.map((entry) => {
        if (entry.kind !== 'agent_session' || entry.ref !== ref || entry.creditsMeasured) return entry;
        changed = true;
        return { ...entry, credits, creditsMeasured: true };
      });
      if (!changed) return;
      tx.set(docRef, { costs }, { merge: true });
    });
  }

  async setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    const docRef = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      const costs = applyMeasuredTokens(existing, ref, tokens);
      if (!costs) return;
      tx.set(docRef, { costs }, { merge: true });
    });
  }

  async setDispatchWorkspace(jobId: number, workspace: string): Promise<void> {
    const ref = this.ref(jobId);
    // Transactional -- a status poll here can race a dispatch write.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      if (!existing) return;
      tx.set(ref, { dispatch: { ...existing, workspace } }, { merge: true });
    });
  }

  async clearDispatchSeedWorkspace(jobId: number): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      if (!existing?.seedWorkspace) return;
      // Rewritten whole -- simpler than a delete sentinel for this small object.
      const dispatch = { ...existing };
      delete dispatch.seedWorkspace;
      tx.set(ref, { dispatch }, { merge: true });
    });
  }

  async claimDispatchReaperAttempt(jobId: number, at: string): Promise<boolean> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (
        current.state !== 'queued' ||
        current.dispatchReaperAttemptedAt ||
        (current.dispatch?.refs?.length ?? 0) > 0
      ) {
        return false;
      }
      tx.set(ref, { dispatchReaperAttemptedAt: at }, { merge: true });
      return true;
    });
  }
}

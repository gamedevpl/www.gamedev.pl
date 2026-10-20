import { FieldValue } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import {
  nextRoundGeneration,
  transitionClosesRound,
  type AgentSessionTokens,
  type JobTransition,
} from '../../creation/job-state.js';
import {
  MAX_JOB_COSTS,
  applyMeasuredTokens,
  applyFinished,
  MAX_JOB_TRANSITIONS,
  JOB_ID_FLOOR,
  type JobSeedOutcome,
  type JobCostEntry,
} from '../records/dispatch.js';
import type { SubmissionRecord } from '../records/submission.js';
import { erasedInTransaction } from './erasure-fence.js';
import { clearRoundSignals, guardHolds, stampReceiptRound, type TransitionGuard } from './round-close.js';

export type { TransitionGuard } from './round-close.js';

export interface DispatchStore {
  // Moves a job to transition.to, stamping stateSince and appending to history.
  recordJobTransition(jobId: number, transition: JobTransition, guard?: TransitionGuard): Promise<boolean>;

  // Appends a dispatch ref -- which backend is building this job, and where.
  recordDispatch(
    jobId: number,
    dispatch: {
      backend: string;
      ref: string;
      workspace?: string;
      seedWorkspace?: string;
      credentialRef?: string;
      memoryOwnerUid?: string;
    },
  ): Promise<void>;

  // Forgets an erased uid as a round's memory owner.
  clearMemoryOwner(uid: string): Promise<number>;

  // Appends one billed thing to the job's ledger; best-effort.
  recordJobCost(jobId: number, entry: JobCostEntry): Promise<void>;

  // Records what a seeded build's draft achieved.
  recordSeedOutcome(jobId: number, outcome: JobSeedOutcome): Promise<void>;

  // Every seed outcome recorded at or after `since`, newest first.
  listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]>;

  // Records an agent_session's tokens; drops the dispatch credit placeholder.
  setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void>;

  // First-settled wins; no-op once already stamped.
  setJobCostFinished(jobId: number, ref: string, finishedAt: string, state: string): Promise<void>;

  // Records where a dispatched job's work actually lives.
  setDispatchWorkspace(jobId: number, workspace: string): Promise<void>;

  // Forgets a released seed branch, so nothing tries to delete it twice.
  clearDispatchSeedWorkspace(jobId: number): Promise<void>;

  // Allocates a job id of our own, from JOB_ID_FLOOR upward.
  allocateJobId(): Promise<number>;

  claimDispatchReaperAttempt(jobId: number, at: string): Promise<boolean>;

  // First-come claim of the first dispatch; false if taken.
  claimInitialDispatch(jobId: number, at: string): Promise<boolean>;
}

export class InMemoryDispatchStore implements DispatchStore {
  private nextJobId = JOB_ID_FLOOR;

  constructor(
    private submissions: Map<number, SubmissionRecord>,
    private erased: (uid: string) => boolean = () => false,
  ) {}

  async recordJobTransition(jobId: number, transition: JobTransition, guard?: TransitionGuard): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub) return false;
    if (guard && !guardHolds(sub, guard)) return false;
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
    if (closes) {
      clearRoundSignals(next);
      stampReceiptRound(next, sub);
    }
    this.submissions.set(jobId, next);
    return true;
  }

  async allocateJobId(): Promise<number> {
    this.nextJobId = Math.max(this.nextJobId, JOB_ID_FLOOR) + 1;
    return this.nextJobId;
  }

  async recordDispatch(
    jobId: number,
    dispatch: {
      backend: string;
      ref: string;
      workspace?: string;
      seedWorkspace?: string;
      credentialRef?: string;
      memoryOwnerUid?: string;
    },
  ): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const existing = sub.dispatch;
    // An erasure that already scrubbed this uid must not see it return.
    const memoryOwnerUid =
      dispatch.memoryOwnerUid && this.erased(dispatch.memoryOwnerUid) ? undefined : dispatch.memoryOwnerUid;
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
        memoryOwnerUid: memoryOwnerUid ?? existing?.memoryOwnerUid,
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

  async clearMemoryOwner(uid: string): Promise<number> {
    let cleared = 0;
    for (const [jobId, sub] of this.submissions) {
      const next = { ...sub };
      if (sub.dispatch?.memoryOwnerUid === uid) {
        next.dispatch = { ...sub.dispatch };
        delete next.dispatch.memoryOwnerUid;
      }
      if (sub.builderHandoff?.requestedByUid === uid) {
        next.builderHandoff = { ...sub.builderHandoff };
        delete next.builderHandoff.requestedByUid;
      }
      if (next.dispatch === sub.dispatch && next.builderHandoff === sub.builderHandoff) continue;
      this.submissions.set(jobId, next);
      cleared += 1;
    }
    return cleared;
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

  async setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.costs?.length) return;
    const costs = applyMeasuredTokens(sub.costs, ref, tokens);
    if (!costs) return;
    this.submissions.set(jobId, { ...sub, costs });
  }

  async setJobCostFinished(jobId: number, ref: string, finishedAt: string, state: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.costs?.length) return;
    const costs = applyFinished(sub.costs, ref, finishedAt, state);
    if (!costs) return;
    this.submissions.set(jobId, { ...sub, costs });
  }

  async setDispatchWorkspace(jobId: number, workspace: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.dispatch) return;
    this.submissions.set(jobId, { ...sub, dispatch: { ...sub.dispatch, workspace } });
  }

  async claimInitialDispatch(jobId: number, at: string): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub || sub.state !== 'queued' || sub.initialDispatchClaimedAt || (sub.dispatch?.refs?.length ?? 0) > 0) {
      return false;
    }
    this.submissions.set(jobId, { ...sub, initialDispatchClaimedAt: at });
    return true;
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
  constructor(private db: GuardedFirestore) {}

  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  async clearMemoryOwner(uid: string): Promise<number> {
    // Nested single-field equality; indexed without configuration.
    const submissions = this.db.collection('submissions');
    const [rounds, handoffs] = await Promise.all([
      submissions.where('dispatch.memoryOwnerUid', '==', uid).get(),
      submissions.where('builderHandoff.requestedByUid', '==', uid).get(),
    ]);
    for (const doc of rounds.docs) {
      await doc.ref.set({ dispatch: { memoryOwnerUid: FieldValue.delete() } }, { merge: true });
    }
    for (const doc of handoffs.docs) {
      await doc.ref.set({ builderHandoff: { requestedByUid: FieldValue.delete() } }, { merge: true });
    }
    return rounds.size + handoffs.size;
  }

  async recordJobTransition(jobId: number, transition: JobTransition, guard?: TransitionGuard): Promise<boolean> {
    const ref = this.ref(jobId);
    // Transactional -- a concurrent poll and sweep could otherwise drop one write.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      // Compared inside the transaction: the claim is what makes a close safe.
      if (guard && !guardHolds(current, guard)) return false;
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
        stampReceiptRound(next, current);
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
    dispatch: {
      backend: string;
      ref: string;
      workspace?: string;
      seedWorkspace?: string;
      credentialRef?: string;
      memoryOwnerUid?: string;
    },
  ): Promise<void> {
    const ref = this.ref(jobId);
    // Transactional -- a dispatch and a reconciler observation could land together.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      // Read in the transaction, so a fence set meanwhile retries us.
      const uid = dispatch.memoryOwnerUid;
      const fenced = uid ? await erasedInTransaction(this.db, tx, uid) : false;
      const memoryOwnerUid = fenced ? undefined : dispatch.memoryOwnerUid;
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
            ...((memoryOwnerUid ?? existing?.memoryOwnerUid)
              ? { memoryOwnerUid: memoryOwnerUid ?? existing?.memoryOwnerUid }
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

  async setJobCostFinished(jobId: number, ref: string, finishedAt: string, state: string): Promise<void> {
    const docRef = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      const costs = applyFinished(existing, ref, finishedAt, state);
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

  async claimInitialDispatch(jobId: number, at: string): Promise<boolean> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (current.state !== 'queued' || current.initialDispatchClaimedAt || (current.dispatch?.refs?.length ?? 0) > 0) {
        return false;
      }
      tx.set(ref, { initialDispatchClaimedAt: at }, { merge: true });
      return true;
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

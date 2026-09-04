import type { Firestore } from '@google-cloud/firestore';
import type { AgentTaskState } from '../../creation/agent-state.js';
import type { SeedFiles } from '../../agent-surface/agent-backend.js';
import type { BuilderKind } from '../../creation/builder.js';
import { nextRoundGeneration, type JobTransition } from '../../creation/job-state.js';
import { MAX_JOB_TRANSITIONS } from '../records/dispatch.js';
import type { BuilderHandoff } from '../records/rounds.js';
import type { SubmissionRecord } from '../records/submission.js';

// Fields a closed round clears -- signals belong to the round that ended.
export function clearRoundSignals(next: SubmissionRecord): void {
  delete next.seed;
  delete next.seedStatus;
  delete next.lastAgentSignalAt;
  delete next.lastAgentPresence;
  delete next.agentEndedAt;
  delete next.agentEndedBy;
  delete next.roundKitEngineRef;
  delete next.roundTypecheckPreflightBypassErrors;
  delete next.roundLastGateMetricKey;
}

export interface RoundsStore {
  // Advances roundGeneration with no state change; null if the job is gone.
  bumpRoundGeneration(jobId: number): Promise<number | null>;

  // Returns the job's active generation, initializing it to 1 when absent.
  ensureRoundGeneration(jobId: number): Promise<number | null>;

  // Clears stale agentEndedAt/lastAgentSignalAt/lastAgentPresence, not round counters.
  clearAgentEnded(jobId: number): Promise<void>;

  // Fixes the round's kit engine; first caller wins unless replace.
  pinRoundKitEngineRef(jobId: number, engineRef: string, replace?: boolean): Promise<string | null>;

  // Records the agent backend's last reported state, for stall detection.
  setSubmissionAgentState(jobId: number, agentState: AgentTaskState): Promise<void>;

  // Records which builder owns the round; resets per-round counters if asked.
  setRoundBuilder(jobId: number, builder: BuilderKind, options?: { resetRoundBudget?: boolean }): Promise<void>;

  requestBuilderHandoff(
    jobId: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck?: boolean,
  ): Promise<boolean>;

  acknowledgeBuilderHandoff(jobId: number, acknowledgedAt: string): Promise<BuilderHandoff | null>;

  clearBuilderHandoff(jobId: number): Promise<void>;

  // Stores (or clears) the generated seed draft on a self-build job.
  setSubmissionSeed(jobId: number, seed: SeedFiles | null): Promise<void>;

  // Atomically claims a ready_for_review round for sealing; null if ineligible.
  // Two concurrent seals must not both start a paid gate run — see the /seal route.
  claimSeal(jobId: number, at: string): Promise<SubmissionRecord | null>;

  // Marks seed generation pending/unavailable; a stored draft is never downgraded.
  setSeedStatus(jobId: number, status: 'pending' | 'unavailable'): Promise<void>;
}

// Mirrors platform/seal-preview.ts's sealRefusal, kept free of its import.
function isSealable(record: Pick<SubmissionRecord, 'state' | 'slug' | 'previewVersion' | 'deliveredVersion'>): boolean {
  return (
    record.state === 'ready_for_review' && !record.deliveredVersion && Boolean(record.slug && record.previewVersion)
  );
}

export class InMemoryRoundsStore implements RoundsStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async bumpRoundGeneration(jobId: number): Promise<number | null> {
    const sub = this.submissions.get(jobId);
    if (!sub) return null;
    const roundGeneration = nextRoundGeneration(sub.roundGeneration);
    const next: SubmissionRecord = {
      ...sub,
      roundGeneration,
      roundDeliveryCount: 0,
      roundTypecheckPreflightRefusals: 0,
      roundSubmitAttempts: 0,
      roundPreflightRefusalsAudio: 0,
      roundPreflightRefusalsSymbols: 0,
      roundStartedAt: new Date().toISOString(),
    };
    clearRoundSignals(next);
    this.submissions.set(jobId, next);
    return roundGeneration;
  }

  async pinRoundKitEngineRef(jobId: number, engineRef: string, replace = false): Promise<string | null> {
    const sub = this.submissions.get(jobId);
    if (!sub) return null;
    if (sub.roundKitEngineRef && !replace) return sub.roundKitEngineRef;
    this.submissions.set(jobId, { ...sub, roundKitEngineRef: engineRef });
    return engineRef;
  }

  async requestBuilderHandoff(
    jobId: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub || sub.builderHandoff) return false;
    const from = sub.builder ?? sub.defaultBuilder ?? 'platform';
    if (from === to) return false;
    this.submissions.set(jobId, { ...sub, builderHandoff: { from, to, requestedAt, awaitsAgentAck } });
    return true;
  }

  async claimSeal(jobId: number, at: string): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(jobId);
    if (!sub || !isSealable(sub)) return null;
    const transition: JobTransition = { to: 'building', at, by: 'creator', reason: 'seal_claimed' };
    this.submissions.set(jobId, {
      ...sub,
      state: 'building',
      stateSince: at,
      transitions: [...(sub.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
    });
    return sub;
  }

  async acknowledgeBuilderHandoff(jobId: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    const sub = this.submissions.get(jobId);
    if (!sub?.builderHandoff || sub.builderHandoff.acknowledgedAt) return null;
    const handoff: BuilderHandoff = { ...sub.builderHandoff, acknowledgedAt };
    this.submissions.set(jobId, { ...sub, builderHandoff: handoff });
    return handoff;
  }

  async clearBuilderHandoff(jobId: number): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub?.builderHandoff) return;
    const next = { ...sub };
    delete next.builderHandoff;
    this.submissions.set(jobId, next);
  }

  async ensureRoundGeneration(jobId: number): Promise<number | null> {
    const sub = this.submissions.get(jobId);
    if (!sub) return null;
    if (sub.roundGeneration !== undefined) return sub.roundGeneration;
    this.submissions.set(jobId, { ...sub, roundGeneration: 1 });
    return 1;
  }

  async clearAgentEnded(jobId: number): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const next = { ...sub };
    delete next.lastAgentSignalAt;
    delete next.lastAgentPresence;
    delete next.agentEndedAt;
    delete next.agentEndedBy;
    this.submissions.set(jobId, next);
  }

  async setSubmissionAgentState(jobId: number, agentState: AgentTaskState): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, agentState });
  }

  async setRoundBuilder(jobId: number, builder: BuilderKind, options?: { resetRoundBudget?: boolean }): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const reset = options?.resetRoundBudget ?? false;
    const next: SubmissionRecord = {
      ...sub,
      builder,
      defaultBuilder: builder,
    };
    if (reset) {
      delete next.seed;
      delete next.seedStatus;
      next.roundDeliveryCount = 0;
      next.roundTypecheckPreflightRefusals = 0;
      next.roundSubmitAttempts = 0;
      next.roundPreflightRefusalsAudio = 0;
      next.roundPreflightRefusalsSymbols = 0;
      next.roundStartedAt = new Date().toISOString();
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
    }
    this.submissions.set(jobId, next);
  }

  async setSubmissionSeed(jobId: number, seed: SeedFiles | null): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    if (seed) {
      this.submissions.set(jobId, { ...sub, seed, seedStatus: 'available' });
      return;
    }
    const next = { ...sub, seedStatus: 'unavailable' as const };
    delete next.seed;
    this.submissions.set(jobId, next);
  }

  async setSeedStatus(jobId: number, status: 'pending' | 'unavailable'): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    // Never downgrade an already-stored draft.
    if (sub.seed) {
      this.submissions.set(jobId, { ...sub, seedStatus: 'available' });
      return;
    }
    this.submissions.set(jobId, { ...sub, seedStatus: status });
  }
}

export class FirestoreRoundsStore implements RoundsStore {
  constructor(private db: Firestore) {}

  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  async bumpRoundGeneration(jobId: number): Promise<number | null> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      const roundGeneration = nextRoundGeneration(current.roundGeneration);
      const next: SubmissionRecord = {
        ...current,
        roundGeneration,
        roundDeliveryCount: 0,
        roundTypecheckPreflightRefusals: 0,
        roundSubmitAttempts: 0,
        roundPreflightRefusalsAudio: 0,
        roundPreflightRefusalsSymbols: 0,
        roundStartedAt: new Date().toISOString(),
      };
      clearRoundSignals(next);
      tx.set(ref, next);
      return roundGeneration;
    });
  }

  async pinRoundKitEngineRef(jobId: number, engineRef: string, replace = false): Promise<string | null> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (current.roundKitEngineRef && !replace) return current.roundKitEngineRef;
      tx.set(ref, { roundKitEngineRef: engineRef }, { merge: true });
      return engineRef;
    });
  }

  async requestBuilderHandoff(
    jobId: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (current.builderHandoff) return false;
      const from = current.builder ?? current.defaultBuilder ?? 'platform';
      if (from === to) return false;
      tx.set(ref, { builderHandoff: { from, to, requestedAt, awaitsAgentAck } }, { merge: true });
      return true;
    });
  }

  async claimSeal(jobId: number, at: string): Promise<SubmissionRecord | null> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (!isSealable(current)) return null;
      const transition: JobTransition = { to: 'building', at, by: 'creator', reason: 'seal_claimed' };
      tx.set(
        ref,
        {
          state: 'building',
          stateSince: at,
          transitions: [...(current.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
        },
        { merge: true },
      );
      return current;
    });
  }

  async acknowledgeBuilderHandoff(jobId: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (!current.builderHandoff || current.builderHandoff.acknowledgedAt) return null;
      const handoff: BuilderHandoff = { ...current.builderHandoff, acknowledgedAt };
      tx.set(ref, { builderHandoff: handoff }, { merge: true });
      return handoff;
    });
  }

  async clearBuilderHandoff(jobId: number): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      if (!current.builderHandoff) return;
      const next = { ...current };
      delete next.builderHandoff;
      tx.set(ref, next);
    });
  }

  async ensureRoundGeneration(jobId: number): Promise<number | null> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (current.roundGeneration !== undefined) return current.roundGeneration;
      tx.set(ref, { roundGeneration: 1 }, { merge: true });
      return 1;
    });
  }

  async clearAgentEnded(jobId: number): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next = { ...current };
      delete next.lastAgentSignalAt;
      delete next.lastAgentPresence;
      delete next.agentEndedAt;
      delete next.agentEndedBy;
      tx.set(ref, next);
    });
  }

  async setSubmissionAgentState(jobId: number, agentState: AgentTaskState): Promise<void> {
    await this.ref(jobId).set({ agentState }, { merge: true });
  }

  async setRoundBuilder(jobId: number, builder: BuilderKind, options?: { resetRoundBudget?: boolean }): Promise<void> {
    const reset = options?.resetRoundBudget ?? false;
    const ref = this.ref(jobId);
    if (!reset) {
      await ref.set({ builder, defaultBuilder: builder }, { merge: true });
      return;
    }
    // Merge can't delete a field, so this rewrites the whole record.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next: SubmissionRecord = {
        ...current,
        builder,
        defaultBuilder: builder,
        roundDeliveryCount: 0,
        roundTypecheckPreflightRefusals: 0,
        roundSubmitAttempts: 0,
        roundPreflightRefusalsAudio: 0,
        roundPreflightRefusalsSymbols: 0,
        roundStartedAt: new Date().toISOString(),
      };
      delete next.seed;
      delete next.seedStatus;
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
      tx.set(ref, next);
    });
  }

  async setSubmissionSeed(jobId: number, seed: SeedFiles | null): Promise<void> {
    const ref = this.ref(jobId);
    if (seed) {
      await ref.set({ seed, seedStatus: 'available' }, { merge: true });
      return;
    }
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next: SubmissionRecord = { ...current, seedStatus: 'unavailable' };
      delete next.seed;
      tx.set(ref, next);
    });
  }

  async setSeedStatus(jobId: number, status: 'pending' | 'unavailable'): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      if (current.seed) {
        tx.set(ref, { seedStatus: 'available' }, { merge: true });
        return;
      }
      tx.set(ref, { seedStatus: status }, { merge: true });
    });
  }
}

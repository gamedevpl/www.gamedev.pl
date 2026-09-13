import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';

export interface RoundBudgetStore {
  // Increments and returns how many seed regenerations this job has asked for.
  incrementSeedRegenerations(jobId: number): Promise<number>;

  // Increments the per-round and whole-job sources-delivery counts.
  incrementRoundDeliveryCount(jobId: number): Promise<number>;

  // Bumps the typecheck-preflight refusal count for this round.
  incrementRoundTypecheckPreflightRefusals(jobId: number): Promise<number>;

  // Stores or clears bypass diagnostics after the refusal cap.
  setRoundTypecheckPreflightBypassErrors(jobId: number, message: string | null): Promise<void>;

  // Bumps submit attempts -- every deliver call that reaches preflight.
  incrementRoundSubmitAttempts(jobId: number): Promise<number>;

  // Bumps the audio or symbols preflight refusal count.
  incrementRoundPreflightRefusal(jobId: number, kind: 'audio' | 'symbols'): Promise<number>;

  // Records that a gate metric was logged for this version/status key.
  setRoundLastGateMetricKey(jobId: number, key: string): Promise<void>;

  // First caller per version wins; one dream run per version.
  claimDreamRun(jobId: number, version: string, at: string): Promise<boolean>;

  // Marks a run finished, posted or not; the TTL is for silence.
  finishDreamRun(jobId: number, claim: DreamClaimRef, at: string): Promise<void>;
}

// Long enough for the slowest live worker; generation runs about two minutes.
export const DREAM_CLAIM_TTL_MS = 10 * 60_000;

// Which attempt is speaking: `claimedAt` is unique per retake.
export interface DreamClaimRef {
  version: string;
  claimedAt: string;
}

// True when this attempt still owns the claim it is reporting on.
export function ownsDreamClaim(
  held: { version: string; claimedAt: string } | undefined,
  claim: DreamClaimRef,
): boolean {
  return held?.version === claim.version && held.claimedAt === claim.claimedAt;
}

// A claim blocks while the run posted, ended, or may run.
export function dreamClaimHolds(
  claim: { version: string; claimedAt: string; postedAt?: string; endedAt?: string } | undefined,
  version: string,
  at: string,
): boolean {
  if (claim?.version !== version) return false;
  if (claim.postedAt || claim.endedAt) return true;
  return Date.parse(at) - Date.parse(claim.claimedAt) < DREAM_CLAIM_TTL_MS;
}

export class InMemoryRoundBudgetStore implements RoundBudgetStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async incrementSeedRegenerations(jobId: number): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    const seedRegenerations = (sub.seedRegenerations ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, seedRegenerations });
    return seedRegenerations;
  }

  async incrementRoundDeliveryCount(jobId: number): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    const roundDeliveryCount = (sub.roundDeliveryCount ?? 0) + 1;
    const jobDeliveryCount = (sub.jobDeliveryCount ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, roundDeliveryCount, jobDeliveryCount });
    return roundDeliveryCount;
  }

  async incrementRoundTypecheckPreflightRefusals(jobId: number): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    const roundTypecheckPreflightRefusals = (sub.roundTypecheckPreflightRefusals ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, roundTypecheckPreflightRefusals });
    return roundTypecheckPreflightRefusals;
  }

  async setRoundTypecheckPreflightBypassErrors(jobId: number, message: string | null): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    if (message == null) {
      const next = { ...sub };
      delete next.roundTypecheckPreflightBypassErrors;
      this.submissions.set(jobId, next);
      return;
    }
    this.submissions.set(jobId, { ...sub, roundTypecheckPreflightBypassErrors: message });
  }

  async incrementRoundSubmitAttempts(jobId: number): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    const roundSubmitAttempts = (sub.roundSubmitAttempts ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, roundSubmitAttempts });
    return roundSubmitAttempts;
  }

  async incrementRoundPreflightRefusal(jobId: number, kind: 'audio' | 'symbols'): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    if (kind === 'audio') {
      const roundPreflightRefusalsAudio = (sub.roundPreflightRefusalsAudio ?? 0) + 1;
      this.submissions.set(jobId, { ...sub, roundPreflightRefusalsAudio });
      return roundPreflightRefusalsAudio;
    }
    const roundPreflightRefusalsSymbols = (sub.roundPreflightRefusalsSymbols ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, roundPreflightRefusalsSymbols });
    return roundPreflightRefusalsSymbols;
  }

  async setRoundLastGateMetricKey(jobId: number, key: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    this.submissions.set(jobId, { ...sub, roundLastGateMetricKey: key });
  }

  async claimDreamRun(jobId: number, version: string, at: string): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (!sub || dreamClaimHolds(sub.dreamRun, version, at)) return false;
    if ((sub.previewVersion ?? sub.deliveredVersion) !== version) return false;
    this.submissions.set(jobId, { ...sub, dreamRun: { version, claimedAt: at } });
    return true;
  }

  async finishDreamRun(jobId: number, claim: DreamClaimRef, at: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    // An expired worker must not close the attempt that replaced it.
    if (!sub || !ownsDreamClaim(sub.dreamRun, claim)) return;
    this.submissions.set(jobId, { ...sub, dreamRun: { ...sub.dreamRun!, endedAt: at } });
  }
}

export class FirestoreRoundBudgetStore implements RoundBudgetStore {
  constructor(private db: Firestore) {}

  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  async incrementSeedRegenerations(jobId: number): Promise<number> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const seedRegenerations = (current.seedRegenerations ?? 0) + 1;
      tx.set(ref, { seedRegenerations }, { merge: true });
      return seedRegenerations;
    });
  }

  async incrementRoundDeliveryCount(jobId: number): Promise<number> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundDeliveryCount = (current.roundDeliveryCount ?? 0) + 1;
      const jobDeliveryCount = (current.jobDeliveryCount ?? 0) + 1;
      tx.set(ref, { roundDeliveryCount, jobDeliveryCount }, { merge: true });
      return roundDeliveryCount;
    });
  }

  async incrementRoundTypecheckPreflightRefusals(jobId: number): Promise<number> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundTypecheckPreflightRefusals = (current.roundTypecheckPreflightRefusals ?? 0) + 1;
      tx.set(ref, { roundTypecheckPreflightRefusals }, { merge: true });
      return roundTypecheckPreflightRefusals;
    });
  }

  async setRoundTypecheckPreflightBypassErrors(jobId: number, message: string | null): Promise<void> {
    const ref = this.ref(jobId);
    if (message == null) {
      await ref.set({ roundTypecheckPreflightBypassErrors: FieldValue.delete() }, { merge: true });
      return;
    }
    await ref.set({ roundTypecheckPreflightBypassErrors: message }, { merge: true });
  }

  async incrementRoundSubmitAttempts(jobId: number): Promise<number> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundSubmitAttempts = (current.roundSubmitAttempts ?? 0) + 1;
      tx.set(ref, { roundSubmitAttempts }, { merge: true });
      return roundSubmitAttempts;
    });
  }

  async incrementRoundPreflightRefusal(jobId: number, kind: 'audio' | 'symbols'): Promise<number> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      if (kind === 'audio') {
        const roundPreflightRefusalsAudio = (current.roundPreflightRefusalsAudio ?? 0) + 1;
        tx.set(ref, { roundPreflightRefusalsAudio }, { merge: true });
        return roundPreflightRefusalsAudio;
      }
      const roundPreflightRefusalsSymbols = (current.roundPreflightRefusalsSymbols ?? 0) + 1;
      tx.set(ref, { roundPreflightRefusalsSymbols }, { merge: true });
      return roundPreflightRefusalsSymbols;
    });
  }

  async setRoundLastGateMetricKey(jobId: number, key: string): Promise<void> {
    await this.ref(jobId).set({ roundLastGateMetricKey: key }, { merge: true });
  }

  async claimDreamRun(jobId: number, version: string, at: string): Promise<boolean> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (dreamClaimHolds(current.dreamRun, version, at)) return false;
      // Read and claim together, or a late claim overwrites.
      if ((current.previewVersion ?? current.deliveredVersion) !== version) return false;
      // A merged map keeps what it omits; start clean.
      tx.set(
        ref,
        { dreamRun: { version, claimedAt: at, postedAt: FieldValue.delete(), endedAt: FieldValue.delete() } },
        { merge: true },
      );
      return true;
    });
  }

  async finishDreamRun(jobId: number, claim: DreamClaimRef, at: string): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const held = (snap.data() as SubmissionRecord | undefined)?.dreamRun;
      // An expired worker must not close the attempt that replaced it.
      if (!ownsDreamClaim(held, claim)) return;
      tx.set(ref, { dreamRun: { ...held!, endedAt: at } }, { merge: true });
    });
  }
}

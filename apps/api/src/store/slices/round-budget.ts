import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';

export interface RoundBudgetStore {
  // Increments and returns how many seed regenerations this job has asked for.
  incrementSeedRegenerations(jobId: number): Promise<number>;

  // Increments and returns the per-round sources-delivery count.
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
    this.submissions.set(jobId, { ...sub, roundDeliveryCount });
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
      tx.set(ref, { roundDeliveryCount }, { merge: true });
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
}

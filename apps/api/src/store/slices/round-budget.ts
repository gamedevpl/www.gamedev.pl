import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';

export interface RoundBudgetStore {
  // Increments and returns how many seed regenerations this job has asked for.
  incrementSeedRegenerations(issueNumber: number): Promise<number>;

  // Increments and returns the per-round sources-delivery count.
  incrementRoundDeliveryCount(issueNumber: number): Promise<number>;

  // Bumps the typecheck-preflight refusal count for this round.
  incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number>;

  // Stores or clears bypass diagnostics after the refusal cap.
  setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void>;

  // Bumps submit attempts -- every deliver call that reaches preflight.
  incrementRoundSubmitAttempts(issueNumber: number): Promise<number>;

  // Bumps the audio or symbols preflight refusal count.
  incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number>;

  // Records that a gate metric was logged for this version/status key.
  setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void>;
}

export class InMemoryRoundBudgetStore implements RoundBudgetStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const seedRegenerations = (sub.seedRegenerations ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, seedRegenerations });
    return seedRegenerations;
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundDeliveryCount = (sub.roundDeliveryCount ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundDeliveryCount });
    return roundDeliveryCount;
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundTypecheckPreflightRefusals = (sub.roundTypecheckPreflightRefusals ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundTypecheckPreflightRefusals });
    return roundTypecheckPreflightRefusals;
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    if (message == null) {
      const next = { ...sub };
      delete next.roundTypecheckPreflightBypassErrors;
      this.submissions.set(issueNumber, next);
      return;
    }
    this.submissions.set(issueNumber, { ...sub, roundTypecheckPreflightBypassErrors: message });
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundSubmitAttempts = (sub.roundSubmitAttempts ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundSubmitAttempts });
    return roundSubmitAttempts;
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    if (kind === 'audio') {
      const roundPreflightRefusalsAudio = (sub.roundPreflightRefusalsAudio ?? 0) + 1;
      this.submissions.set(issueNumber, { ...sub, roundPreflightRefusalsAudio });
      return roundPreflightRefusalsAudio;
    }
    const roundPreflightRefusalsSymbols = (sub.roundPreflightRefusalsSymbols ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundPreflightRefusalsSymbols });
    return roundPreflightRefusalsSymbols;
  }

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    this.submissions.set(issueNumber, { ...sub, roundLastGateMetricKey: key });
  }
}

export class FirestoreRoundBudgetStore implements RoundBudgetStore {
  constructor(private db: Firestore) {}

  private ref(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber));
  }

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    const ref = this.ref(issueNumber);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const seedRegenerations = (current.seedRegenerations ?? 0) + 1;
      tx.set(ref, { seedRegenerations }, { merge: true });
      return seedRegenerations;
    });
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    const ref = this.ref(issueNumber);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundDeliveryCount = (current.roundDeliveryCount ?? 0) + 1;
      tx.set(ref, { roundDeliveryCount }, { merge: true });
      return roundDeliveryCount;
    });
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    const ref = this.ref(issueNumber);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundTypecheckPreflightRefusals = (current.roundTypecheckPreflightRefusals ?? 0) + 1;
      tx.set(ref, { roundTypecheckPreflightRefusals }, { merge: true });
      return roundTypecheckPreflightRefusals;
    });
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    const ref = this.ref(issueNumber);
    if (message == null) {
      await ref.set({ roundTypecheckPreflightBypassErrors: FieldValue.delete() }, { merge: true });
      return;
    }
    await ref.set({ roundTypecheckPreflightBypassErrors: message }, { merge: true });
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    const ref = this.ref(issueNumber);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundSubmitAttempts = (current.roundSubmitAttempts ?? 0) + 1;
      tx.set(ref, { roundSubmitAttempts }, { merge: true });
      return roundSubmitAttempts;
    });
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    const ref = this.ref(issueNumber);
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

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    await this.ref(issueNumber).set({ roundLastGateMetricKey: key }, { merge: true });
  }
}

import type { Firestore } from '@google-cloud/firestore';
import type { CreationLimits } from '../records/quota.js';

// The site mascot's lane: a shared daily token count.

export interface AssistantQuotaStore {
  // Site-mascot tokens everyone together has spent on `dateStr`.
  getGlobalAssistantTokenCount(dateStr: string): Promise<number>;
  // Holds `tokens` unless the hold itself would cross `limit`.
  checkAndIncrementGlobalAssistantTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }>;
  // Settles a hold to what the call used; never below zero.
  adjustGlobalAssistantTokens(dateStr: string, delta: number): Promise<number>;
}

type TokenLaneLimits = Pick<
  CreationLimits,
  'tabCompletePaused' | 'globalDailyTabCompleteTokenCap' | 'assistantPaused' | 'globalDailyAssistantTokenCap'
>;

const cap = (patched: number | null | undefined, stored: number | null | undefined) =>
  patched !== undefined ? patched : (stored ?? null);
const storedCap = (value: unknown) => (typeof value === 'number' ? value : null);

// A patch over stored token-lane limits; absent fields keep their value.
export function mergeTokenLaneLimits(
  patch: Partial<CreationLimits>,
  stored: Partial<CreationLimits> | null | undefined,
): TokenLaneLimits {
  return {
    tabCompletePaused: patch.tabCompletePaused ?? stored?.tabCompletePaused ?? false,
    globalDailyTabCompleteTokenCap: cap(patch.globalDailyTabCompleteTokenCap, stored?.globalDailyTabCompleteTokenCap),
    assistantPaused: patch.assistantPaused ?? stored?.assistantPaused ?? false,
    globalDailyAssistantTokenCap: cap(patch.globalDailyAssistantTokenCap, stored?.globalDailyAssistantTokenCap),
  };
}

// The token-lane limits as a stored document holds them.
export function readTokenLaneLimits(data: Partial<CreationLimits> | undefined): TokenLaneLimits {
  return {
    tabCompletePaused: data?.tabCompletePaused === true,
    globalDailyTabCompleteTokenCap: storedCap(data?.globalDailyTabCompleteTokenCap),
    assistantPaused: data?.assistantPaused === true,
    globalDailyAssistantTokenCap: storedCap(data?.globalDailyAssistantTokenCap),
  };
}

export class MemoryAssistantQuota implements AssistantQuotaStore {
  private globalAssistantTokens = new Map<string, number>();

  async getGlobalAssistantTokenCount(dateStr: string): Promise<number> {
    return this.globalAssistantTokens.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalAssistantTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalAssistantTokens.get(dateStr) ?? 0;
    const next = current + tokens;
    if (next > limit) return { allowed: false, current };
    this.globalAssistantTokens.set(dateStr, next);
    return { allowed: true, current: next };
  }

  async adjustGlobalAssistantTokens(dateStr: string, delta: number): Promise<number> {
    const next = Math.max(0, (this.globalAssistantTokens.get(dateStr) ?? 0) + delta);
    this.globalAssistantTokens.set(dateStr, next);
    return next;
  }
}

export class FirestoreAssistantQuota implements AssistantQuotaStore {
  constructor(protected db: Firestore) {}

  // Same per-day document as the other shared allowances.
  private assistantUsageRef(dateStr: string) {
    return this.db.collection('globalUsage').doc(dateStr);
  }

  async getGlobalAssistantTokenCount(dateStr: string): Promise<number> {
    const snap = await this.assistantUsageRef(dateStr).get();
    return storedCap(snap.data()?.assistantTokens) ?? 0;
  }

  async checkAndIncrementGlobalAssistantTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.assistantUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const current = storedCap((await transaction.get(ref)).data()?.assistantTokens) ?? 0;
      const next = current + tokens;
      if (next > limit) return { allowed: false, current };
      transaction.set(ref, { assistantTokens: next }, { merge: true });
      return { allowed: true, current: next };
    });
  }

  async adjustGlobalAssistantTokens(dateStr: string, delta: number): Promise<number> {
    const ref = this.assistantUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const current = storedCap((await transaction.get(ref)).data()?.assistantTokens) ?? 0;
      const next = Math.max(0, current + delta);
      transaction.set(ref, { assistantTokens: next }, { merge: true });
      return next;
    });
  }
}

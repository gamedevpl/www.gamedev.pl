import type { Firestore } from '@google-cloud/firestore';
import { emptyUsageCounters } from './quota.js';
import type { UsageCounters } from '../records/quota.js';

// Shared per-game daily cap. Trusted actors still hit this.

export interface GameQuotaStore {
  getGameUsage(slug: string, dateStr: string): Promise<UsageCounters>;
  checkAndIncrementGameQuota(
    slug: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number }>;
  decrementGameQuota(slug: string, dateStr: string, action: keyof UsageCounters): Promise<void>;
}

export class InMemoryGameQuotaStore implements GameQuotaStore {
  usage = new Map<string, UsageCounters>();

  async getGameUsage(slug: string, dateStr: string): Promise<UsageCounters> {
    return { ...(this.usage.get(`${slug}:${dateStr}`) ?? emptyUsageCounters()) };
  }

  async checkAndIncrementGameQuota(
    slug: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number }> {
    const key = `${slug}:${dateStr}`;
    const currentCounters = this.usage.get(key) ?? emptyUsageCounters();
    const currentVal = currentCounters[action] ?? 0;
    if (currentVal >= limit) return { allowed: false, current: currentVal };
    const next = { ...currentCounters, [action]: currentVal + 1 };
    this.usage.set(key, next);
    return { allowed: true, current: currentVal + 1 };
  }

  async decrementGameQuota(slug: string, dateStr: string, action: keyof UsageCounters): Promise<void> {
    const key = `${slug}:${dateStr}`;
    const currentCounters = this.usage.get(key) ?? emptyUsageCounters();
    const currentVal = currentCounters[action] ?? 0;
    if (currentVal <= 0) return;
    this.usage.set(key, { ...currentCounters, [action]: currentVal - 1 });
  }
}

export class FirestoreGameQuotaStore implements GameQuotaStore {
  constructor(private db: Firestore) {}

  private doc(slug: string, dateStr: string) {
    return this.db.collection('gameQuota').doc(`${slug}:${dateStr}`);
  }

  async getGameUsage(slug: string, dateStr: string): Promise<UsageCounters> {
    const snap = await this.doc(slug, dateStr).get();
    return snap.exists
      ? ({ ...emptyUsageCounters(), ...(snap.data() as UsageCounters) } as UsageCounters)
      : emptyUsageCounters();
  }

  async checkAndIncrementGameQuota(
    slug: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.doc(slug, dateStr);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const currentCounters = snap.exists
        ? ({ ...emptyUsageCounters(), ...(snap.data() as UsageCounters) } as UsageCounters)
        : emptyUsageCounters();
      const currentVal = currentCounters[action] ?? 0;
      if (currentVal >= limit) return { allowed: false, current: currentVal };
      const next = { ...currentCounters, [action]: currentVal + 1 };
      tx.set(ref, next);
      return { allowed: true, current: currentVal + 1 };
    });
  }

  async decrementGameQuota(slug: string, dateStr: string, action: keyof UsageCounters): Promise<void> {
    const ref = this.doc(slug, dateStr);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const currentCounters = { ...emptyUsageCounters(), ...(snap.data() as UsageCounters) } as UsageCounters;
      const currentVal = currentCounters[action] ?? 0;
      if (currentVal <= 0) return;
      tx.set(ref, { ...currentCounters, [action]: currentVal - 1 });
    });
  }
}

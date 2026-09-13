import type { Firestore } from '@google-cloud/firestore';

// The shared daily allowance of concept frames (NP-1v).
export interface DreamQuotaStore {
  // Concept frames everyone together has dreamt on `dateStr`.
  getGlobalDreamCount(dateStr: string): Promise<number>;

  // Spends `count` frames when they all fit under `limit`, or none.
  checkAndIncrementGlobalDreams(
    dateStr: string,
    limit: number,
    count?: number,
  ): Promise<{ allowed: boolean; current: number }>;
}

export class InMemoryDreamQuotaStore implements DreamQuotaStore {
  private globalDreams = new Map<string, number>();

  async getGlobalDreamCount(dateStr: string): Promise<number> {
    return this.globalDreams.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalDreams(
    dateStr: string,
    limit: number,
    count = 1,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalDreams.get(dateStr) ?? 0;
    if (current + count > limit) return { allowed: false, current };
    this.globalDreams.set(dateStr, current + count);
    return { allowed: true, current: current + count };
  }
}

export class FirestoreDreamQuotaStore implements DreamQuotaStore {
  constructor(private db: Firestore) {}

  // Same document as the other daily counters, one more field.
  private globalUsageRef(dateStr: string) {
    return this.db.collection('globalUsage').doc(dateStr);
  }

  async getGlobalDreamCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.dreams;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalDreams(
    dateStr: string,
    limit: number,
    count = 1,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.dreams;
      const current = typeof value === 'number' ? value : 0;
      // All or none: half a proposal is spend for nothing.
      if (current + count > limit) return { allowed: false, current };
      transaction.set(ref, { dreams: current + count }, { merge: true });
      return { allowed: true, current: current + count };
    });
  }
}

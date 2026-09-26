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

  // Spends one Studio health scan in the creator's hour bucket.
  checkAndIncrementStudioHealthScans(
    uid: string,
    hour: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }>;
}

export class InMemoryDreamQuotaStore implements DreamQuotaStore {
  private globalDreams = new Map<string, number>();
  private studioHealthScans = new Map<string, number>();

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

  async checkAndIncrementStudioHealthScans(
    uid: string,
    hour: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const key = `${uid}:${hour}`;
    const current = this.studioHealthScans.get(key) ?? 0;
    if (current >= limit) return { allowed: false, current };
    this.studioHealthScans.set(key, current + 1);
    return { allowed: true, current: current + 1 };
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

  // Beside the daily counters, so account erasure already removes it.
  async checkAndIncrementStudioHealthScans(
    uid: string,
    hour: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.db.collection('usage').doc(uid).collection('counters').doc(`studio-health-${hour}`);
    return await this.db.runTransaction(async (transaction) => {
      const value = (await transaction.get(ref)).data()?.scans;
      const current = typeof value === 'number' ? value : 0;
      if (current >= limit) return { allowed: false, current };
      transaction.set(ref, { scans: current + 1 }, { merge: true });
      return { allowed: true, current: current + 1 };
    });
  }
}

import type { Firestore } from '@google-cloud/firestore';

export interface GlobalQuotaStore {
  // How many submissions everyone together has made on `dateStr`.
  getGlobalSubmissionCount(dateStr: string): Promise<number>;

  // Tab-complete tokens everyone together has spent on `dateStr`.
  getGlobalTabCompleteTokenCount(dateStr: string): Promise<number>;

  // Takes one slot from the day's shared submission allowance, or refuses.
  checkAndIncrementGlobalSubmissions(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Same shape, for the editing lanes' shared daily model-call allowance.
  checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Same shape, for the chat agent's own shared daily allowance.
  checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Same shape, counting tokens for ghost-text completion.
  checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }>;

  // Reconciles a reservation against usage; never refused, floors at 0.
  adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number>;

  // Platform rounds everyone together has started on `dateStr`.
  getGlobalManagedBuildCount(dateStr: string): Promise<number>;

  // Same shape, for the shared daily ceiling.
  checkAndIncrementGlobalManagedBuilds(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;
}

export class InMemoryGlobalQuotaStore implements GlobalQuotaStore {
  private globalSubmissions = new Map<string, number>();
  private globalEdits = new Map<string, number>();
  private globalChats = new Map<string, number>();
  private globalManagedBuilds = new Map<string, number>();
  private globalTabCompleteTokens = new Map<string, number>();

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    return this.globalSubmissions.get(dateStr) ?? 0;
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    return this.globalTabCompleteTokens.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalSubmissions.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalSubmissions.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalEdits.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalEdits.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalChats.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalChats.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalTabCompleteTokens.get(dateStr) ?? 0;
    const next = current + tokens;
    // Refuse a reservation that would itself cross the cap.
    if (next > limit) {
      return { allowed: false, current };
    }
    this.globalTabCompleteTokens.set(dateStr, next);
    return { allowed: true, current: next };
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    const current = this.globalTabCompleteTokens.get(dateStr) ?? 0;
    const next = Math.max(0, current + delta);
    this.globalTabCompleteTokens.set(dateStr, next);
    return next;
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    return this.globalManagedBuilds.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalManagedBuilds.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalManagedBuilds.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }
}

export class FirestoreGlobalQuotaStore implements GlobalQuotaStore {
  constructor(private db: Firestore) {}

  // The day's shared allowance -- one document per UTC day.
  private globalUsageRef(dateStr: string) {
    return this.db.collection('globalUsage').doc(dateStr);
  }

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.submissions;
    return typeof value === 'number' ? value : 0;
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.tabCompleteTokens;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.submissions;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { submissions: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.edits;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { edits: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.chats;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { chats: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.tabCompleteTokens;
      const current = typeof value === 'number' ? value : 0;
      const nextVal = current + tokens;

      // Refuse a reservation that would itself cross the cap.
      if (nextVal > limit) {
        return { allowed: false, current };
      }

      transaction.set(ref, { tabCompleteTokens: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.tabCompleteTokens;
      const current = typeof value === 'number' ? value : 0;
      const next = Math.max(0, current + delta);
      transaction.set(ref, { tabCompleteTokens: next }, { merge: true });
      return next;
    });
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.managedBuilds;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.managedBuilds;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { managedBuilds: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }
}

import type { Firestore } from '@google-cloud/firestore';
import { bumpShard, shardedCount, spendShard } from './quota-shards.js';


export interface GlobalQuotaStore {
  // How many submissions everyone together has made on `dateStr`.
  getGlobalSubmissionCount(dateStr: string): Promise<number>;

  // Tab-complete tokens everyone together has spent on `dateStr`.
  getGlobalTabCompleteTokenCount(dateStr: string): Promise<number>;

  // Editing-model calls everyone together has made on `dateStr`.
  getGlobalEditCount(dateStr: string): Promise<number>;

  // Gate builds everyone together has started on `dateStr`.
  getGlobalGateRunCount(dateStr: string): Promise<number>;

  // Seed pipelines everyone together has started on `dateStr`.
  getGlobalSeedCount(dateStr: string): Promise<number>;

  // Paid calls automation accounts together have made on `dateStr`.
  getGlobalBotCallCount(dateStr: string): Promise<number>;

  // Same shape, for the shared daily automation allowance.
  checkAndIncrementGlobalBotCalls(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Paid moderation calls everyone together has made on `dateStr`.
  getGlobalModerationCount(dateStr: string): Promise<number>;

  // Records one; never refuses. Visibility first.
  incrementGlobalModerationCalls(dateStr: string, calls: number): Promise<number>;

  // Same shape, for the shared daily seed allowance.
  checkAndIncrementGlobalSeeds(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Same shape, for the shared daily gate-run allowance.
  checkAndIncrementGlobalGateRuns(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

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

  // Paid query embeddings everyone together has spent on `dateStr`.
  getGlobalSearchEmbeddingCount(dateStr: string): Promise<number>;

  // Same shape, for semantic search's shared daily embedding allowance.
  checkAndIncrementGlobalSearchEmbeddings(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }>;

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
  private globalSearchEmbeddings = new Map<string, number>();
  private globalGateRuns = new Map<string, number>();
  private globalSeeds = new Map<string, number>();
  private globalModerationCalls = new Map<string, number>();
  private globalBotCalls = new Map<string, number>();

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    return this.globalSubmissions.get(dateStr) ?? 0;
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    return this.globalTabCompleteTokens.get(dateStr) ?? 0;
  }

  async getGlobalEditCount(dateStr: string): Promise<number> {
    return this.globalEdits.get(dateStr) ?? 0;
  }

  async getGlobalGateRunCount(dateStr: string): Promise<number> {
    return this.globalGateRuns.get(dateStr) ?? 0;
  }

  async getGlobalSeedCount(dateStr: string): Promise<number> {
    return this.globalSeeds.get(dateStr) ?? 0;
  }

  async getGlobalBotCallCount(dateStr: string): Promise<number> {
    return this.globalBotCalls.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalBotCalls(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalBotCalls.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalBotCalls.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async getGlobalModerationCount(dateStr: string): Promise<number> {
    return this.globalModerationCalls.get(dateStr) ?? 0;
  }

  async incrementGlobalModerationCalls(dateStr: string, calls: number): Promise<number> {
    const next = (this.globalModerationCalls.get(dateStr) ?? 0) + calls;
    this.globalModerationCalls.set(dateStr, next);
    return next;
  }

  async checkAndIncrementGlobalSeeds(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalSeeds.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalSeeds.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalGateRuns(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalGateRuns.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalGateRuns.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
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

  async getGlobalSearchEmbeddingCount(dateStr: string): Promise<number> {
    return this.globalSearchEmbeddings.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalSearchEmbeddings(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalSearchEmbeddings.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalSearchEmbeddings.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
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

  async getGlobalEditCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.edits;
    return typeof value === 'number' ? value : 0;
  }

  async getGlobalGateRunCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.gateRuns;
    return typeof value === 'number' ? value : 0;
  }

  async getGlobalSeedCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.seeds;
    return typeof value === 'number' ? value : 0;
  }

  async getGlobalBotCallCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.botCalls;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalBotCalls(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.botCalls;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { botCalls: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  // Sharded: moderation runs on every moderated request.
  async getGlobalModerationCount(dateStr: string): Promise<number> {
    return shardedCount(this.db, dateStr, 'moderationCalls');
  }

  async incrementGlobalModerationCalls(dateStr: string, calls: number): Promise<number> {
    return bumpShard(this.db, dateStr, 'moderationCalls', calls);
  }

  async checkAndIncrementGlobalSeeds(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.seeds;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { seeds: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalGateRuns(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.gateRuns;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { gateRuns: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
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

  // Sharded: a query embedding fires on every pause in typing.
  async getGlobalSearchEmbeddingCount(dateStr: string): Promise<number> {
    return shardedCount(this.db, dateStr, 'searchEmbeddings');
  }

  async checkAndIncrementGlobalSearchEmbeddings(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return spendShard(this.db, dateStr, 'searchEmbeddings', limit);
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

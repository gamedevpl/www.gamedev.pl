import type { Firestore } from '@google-cloud/firestore';
import { MANAGED_AGENT_VENDORS } from '@gamedevpl/contract';
import type { CreationLimits, PublicPlayConfig, FeaturedPoolConfig, UsageCounters } from '../records/quota.js';
import type { User } from '../records/identity.js';

const PUBLIC_PLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Set preserves insertion order -- a rotation, not a set.
function normalizeFeaturedPoolSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        const slug = entry.trim().toLowerCase();
        return PUBLIC_PLAY_SLUG_PATTERN.test(slug) ? [slug] : [];
      }),
    ),
  ];
}

function normalizePublicPlaySlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        const slug = entry.trim().toLowerCase();
        return PUBLIC_PLAY_SLUG_PATTERN.test(slug) ? [slug] : [];
      }),
    ),
  ];
}

// Exported so quota-global.ts's getUsage/checkAndIncrementQuota share the same shape.
export function emptyUsageCounters(): UsageCounters {
  return {
    submissions: 0,
    previews: 0,
    mocks: 0,
    refines: 0,
    feedback: 0,
    playerFeedback: 0,
    improvements: 0,
    assists: 0,
    chats: 0,
    managedBuilds: 0,
    tabCompletes: 0,
  };
}

export interface QuotaStore {
  // Today's usage counters for a user, without incrementing anything.
  getUsage(uid: string, dateStr: string): Promise<UsageCounters>;

  checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }>;

  // The stored circuit-breaker, or null when nobody has ever set one.
  getCreationLimits(): Promise<CreationLimits | null>;

  // Merges a change into the stored breaker and returns the result.
  setCreationLimits(patch: Partial<Omit<CreationLimits, 'updatedAt'>>, updatedBy: string): Promise<CreationLimits>;

  getPublicPlayConfig(): Promise<PublicPlayConfig | null>;

  setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig>;

  // Stored curated pool, or null when nobody has set one.
  getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null>;

  setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig>;
}

export class InMemoryQuotaStore implements QuotaStore {
  // Not private -- deleteAccountIdentity reaches across this (documented exception, see PR).
  usage = new Map<string, UsageCounters>();
  private creationLimits: CreationLimits | null = null;
  private publicPlayConfig: PublicPlayConfig | null = null;
  private featuredPoolConfig: FeaturedPoolConfig | null = null;

  constructor(private getUser: (uid: string) => Promise<User | null>) {}

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    return { ...(this.usage.get(`${uid}:${dateStr}`) ?? emptyUsageCounters()) };
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const user = await this.getUser(uid);
    const tier = user?.tier ?? 'standard';

    if (tier === 'blocked') {
      return { allowed: false, current: Infinity, tier };
    }

    if (tier === 'trusted') {
      return { allowed: true, current: 0, tier };
    }

    const key = `${uid}:${dateStr}`;
    const currentCounters: UsageCounters = this.usage.get(key) ?? emptyUsageCounters();
    const currentVal = currentCounters[action] ?? 0;

    if (currentVal >= limit) {
      return { allowed: false, current: currentVal, tier };
    }

    const newCounters: UsageCounters = {
      ...currentCounters,
      [action]: currentVal + 1,
    };
    this.usage.set(key, newCounters);

    return { allowed: true, current: newCounters[action], tier };
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    return this.creationLimits ? { ...this.creationLimits } : null;
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    const merged: CreationLimits = {
      paused: patch.paused ?? this.creationLimits?.paused ?? false,
      globalDailySubmissionCap:
        patch.globalDailySubmissionCap !== undefined
          ? patch.globalDailySubmissionCap
          : (this.creationLimits?.globalDailySubmissionCap ?? null),
      editingPaused: patch.editingPaused ?? this.creationLimits?.editingPaused ?? false,
      remixTracePaused: patch.remixTracePaused ?? this.creationLimits?.remixTracePaused ?? false,
      globalDailyEditCap:
        patch.globalDailyEditCap !== undefined
          ? patch.globalDailyEditCap
          : (this.creationLimits?.globalDailyEditCap ?? null),
      chatPaused: patch.chatPaused ?? this.creationLimits?.chatPaused ?? false,
      globalDailyChatCap:
        patch.globalDailyChatCap !== undefined
          ? patch.globalDailyChatCap
          : (this.creationLimits?.globalDailyChatCap ?? null),
      tabCompletePaused: patch.tabCompletePaused ?? this.creationLimits?.tabCompletePaused ?? false,
      globalDailyTabCompleteTokenCap:
        patch.globalDailyTabCompleteTokenCap !== undefined
          ? patch.globalDailyTabCompleteTokenCap
          : (this.creationLimits?.globalDailyTabCompleteTokenCap ?? null),
      managedBuilderMode: patch.managedBuilderMode ?? this.creationLimits?.managedBuilderMode ?? 'auto',
      managedAgentVendorOverride:
        patch.managedAgentVendorOverride !== undefined
          ? patch.managedAgentVendorOverride
          : (this.creationLimits?.managedAgentVendorOverride ?? null),
      managedDailyCap:
        patch.managedDailyCap !== undefined ? patch.managedDailyCap : (this.creationLimits?.managedDailyCap ?? null),
      managedDailyUserCap:
        patch.managedDailyUserCap !== undefined
          ? patch.managedDailyUserCap
          : (this.creationLimits?.managedDailyUserCap ?? null),
      seedingMode: patch.seedingMode ?? this.creationLimits?.seedingMode ?? 'auto',
      seedProviderOverride:
        patch.seedProviderOverride !== undefined
          ? patch.seedProviderOverride
          : (this.creationLimits?.seedProviderOverride ?? null),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.creationLimits = merged;
    return { ...merged };
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    return this.publicPlayConfig ? { ...this.publicPlayConfig, slugs: [...this.publicPlayConfig.slugs] } : null;
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    const config: PublicPlayConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.publicPlayConfig = config;
    return { ...config, slugs: [...config.slugs] };
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    return this.featuredPoolConfig ? { ...this.featuredPoolConfig, slugs: [...this.featuredPoolConfig.slugs] } : null;
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    const config: FeaturedPoolConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.featuredPoolConfig = config;
    return { ...config, slugs: [...config.slugs] };
  }
}

export class FirestoreQuotaStore implements QuotaStore {
  constructor(private db: Firestore) {}

  private creationLimitsRef() {
    return this.db.collection('opsConfig').doc('creationLimits');
  }

  private publicPlayConfigRef() {
    return this.db.collection('opsConfig').doc('publicPlay');
  }

  private featuredPoolConfigRef() {
    return this.db.collection('opsConfig').doc('featuredPool');
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    const snap = await this.db.collection('usage').doc(uid).collection('counters').doc(dateStr).get();
    return { ...emptyUsageCounters(), ...(snap.data() as Partial<UsageCounters> | undefined) };
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const userRef = this.db.collection('users').doc(uid);
    const counterRef = this.db.collection('usage').doc(uid).collection('counters').doc(dateStr);

    return await this.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const user = userSnap.exists ? (userSnap.data() as User) : null;
      const tier = user?.tier ?? 'standard';

      if (tier === 'blocked') {
        return { allowed: false, current: Infinity, tier };
      }

      if (tier === 'trusted') {
        return { allowed: true, current: 0, tier };
      }

      const counterSnap = await transaction.get(counterRef);
      const data = counterSnap.exists ? counterSnap.data() : {};
      const currentVal = (data?.[action] as number) ?? 0;

      if (currentVal >= limit) {
        return { allowed: false, current: currentVal, tier };
      }

      const nextVal = currentVal + 1;
      transaction.set(counterRef, { [action]: nextVal }, { merge: true });

      return { allowed: true, current: nextVal, tier };
    });
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    const snap = await this.creationLimitsRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<CreationLimits> | undefined;
    return {
      paused: data?.paused === true,
      globalDailySubmissionCap:
        typeof data?.globalDailySubmissionCap === 'number' ? data.globalDailySubmissionCap : null,
      editingPaused: data?.editingPaused === true,
      remixTracePaused: data?.remixTracePaused === true,
      globalDailyEditCap: typeof data?.globalDailyEditCap === 'number' ? data.globalDailyEditCap : null,
      chatPaused: data?.chatPaused === true,
      globalDailyChatCap: typeof data?.globalDailyChatCap === 'number' ? data.globalDailyChatCap : null,
      tabCompletePaused: data?.tabCompletePaused === true,
      globalDailyTabCompleteTokenCap:
        typeof data?.globalDailyTabCompleteTokenCap === 'number' ? data.globalDailyTabCompleteTokenCap : null,
      managedBuilderMode:
        data?.managedBuilderMode === 'off' || data?.managedBuilderMode === 'coming_soon'
          ? data.managedBuilderMode
          : 'auto',
      managedAgentVendorOverride:
        typeof data?.managedAgentVendorOverride === 'string' &&
        MANAGED_AGENT_VENDORS.includes(data.managedAgentVendorOverride)
          ? data.managedAgentVendorOverride
          : null,
      managedDailyCap: typeof data?.managedDailyCap === 'number' ? data.managedDailyCap : null,
      managedDailyUserCap: typeof data?.managedDailyUserCap === 'number' ? data.managedDailyUserCap : null,
      seedingMode: data?.seedingMode === 'off' ? 'off' : 'auto',
      seedProviderOverride: typeof data?.seedProviderOverride === 'string' ? data.seedProviderOverride : null,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    const ref = this.creationLimitsRef();
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const existing = snap.exists ? (snap.data() as Partial<CreationLimits>) : {};
      const merged: CreationLimits = {
        paused: patch.paused ?? existing.paused ?? false,
        globalDailySubmissionCap:
          patch.globalDailySubmissionCap !== undefined
            ? patch.globalDailySubmissionCap
            : (existing.globalDailySubmissionCap ?? null),
        editingPaused: patch.editingPaused ?? existing.editingPaused ?? false,
        globalDailyEditCap:
          patch.globalDailyEditCap !== undefined ? patch.globalDailyEditCap : (existing.globalDailyEditCap ?? null),
        chatPaused: patch.chatPaused ?? existing.chatPaused ?? false,
        globalDailyChatCap:
          patch.globalDailyChatCap !== undefined ? patch.globalDailyChatCap : (existing.globalDailyChatCap ?? null),
        tabCompletePaused: patch.tabCompletePaused ?? existing.tabCompletePaused ?? false,
        globalDailyTabCompleteTokenCap:
          patch.globalDailyTabCompleteTokenCap !== undefined
            ? patch.globalDailyTabCompleteTokenCap
            : (existing.globalDailyTabCompleteTokenCap ?? null),
        managedBuilderMode: patch.managedBuilderMode ?? existing.managedBuilderMode ?? 'auto',
        managedAgentVendorOverride:
          patch.managedAgentVendorOverride !== undefined
            ? patch.managedAgentVendorOverride
            : (existing.managedAgentVendorOverride ?? null),
        managedDailyCap:
          patch.managedDailyCap !== undefined ? patch.managedDailyCap : (existing.managedDailyCap ?? null),
        managedDailyUserCap:
          patch.managedDailyUserCap !== undefined ? patch.managedDailyUserCap : (existing.managedDailyUserCap ?? null),
        seedingMode: patch.seedingMode ?? existing.seedingMode ?? 'auto',
        seedProviderOverride:
          patch.seedProviderOverride !== undefined
            ? patch.seedProviderOverride
            : (existing.seedProviderOverride ?? null),
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
      transaction.set(ref, merged);
      return merged;
    });
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    const snap = await this.publicPlayConfigRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<PublicPlayConfig> | undefined;
    const slugs = normalizePublicPlaySlugs(data?.slugs);
    return {
      slugs,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    const config: PublicPlayConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await this.publicPlayConfigRef().set(config);
    return { ...config, slugs: [...config.slugs] };
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    const snap = await this.featuredPoolConfigRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<FeaturedPoolConfig> | undefined;
    const slugs = normalizeFeaturedPoolSlugs(data?.slugs);
    return {
      slugs,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    const config: FeaturedPoolConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await this.featuredPoolConfigRef().set(config);
    return { ...config, slugs: [...config.slugs] };
  }
}

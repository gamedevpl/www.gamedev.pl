// Whether the platform builder is available right now (self is always available).

// Reuses the creation-limits document and TTL cache; see creation-limits.ts.

import { BOT_UID_PREFIX, type CreationLimits, type Store } from '../platform/store.js';
import { resolveDefaultGlobalDailyBotCallCap } from '../platform/bot-allowance.js';

import type { BuilderUnavailableReason } from '@gamedevpl/contract';

export type ManagedUnavailableReason = BuilderUnavailableReason;

export type ManagedAvailability = { available: true } | { available: false; reason: ManagedUnavailableReason };

export { MANAGED_UNAVAILABLE_ERROR } from '../platform/managed-builder-error.js';

export const DEFAULT_MANAGED_AVAILABILITY_TTL_MS = 60_000;

// Unset must not read as unlimited here.
export const DEFAULT_MANAGED_DAILY_CAP = 40;
export const DEFAULT_MANAGED_DAILY_USER_CAP = 5;

export interface ManagedAvailabilityOptions {
  // Absent only in tests with no store; caps and mode are skipped.
  store?: Store;
  now?: () => number;
  ttlMs?: number;
  // Whether the registry's `platform` backend is actually wired.
  hasPlatformBackend: boolean;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
  // Vendors with a real backend built at boot.
  configuredVendors?: ReadonlySet<string>;
  // MANAGED_AGENT_VENDOR — what resolveVendor() returns absent a valid override.
  defaultVendor?: string;
}

export interface ManagedAvailabilityGate {
  // Read-only — never spends a slot. For display and pre-flight checks.
  peek(uid: string, dateStr: string): Promise<ManagedAvailability>;
  // Spends the daily slot on success. Call right before a fresh dispatch.
  checkAndSpend(uid: string, dateStr: string): Promise<ManagedAvailability>;
  // Vendor a fresh dispatch should use: stored override, else defaultVendor.
  resolveVendor(): Promise<string | undefined>;
}

function bypassesBreaker(uid: string): boolean {
  return uid.startsWith(BOT_UID_PREFIX);
}

export function createManagedAvailabilityGate(options: ManagedAvailabilityOptions): ManagedAvailabilityGate {
  const { store, hasPlatformBackend, configuredVendors, defaultVendor } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_MANAGED_AVAILABILITY_TTL_MS;
  const logWarn = options.logWarn ?? (() => {});

  let cache: { value: CreationLimits | null; expiresAt: number } | null = null;

  async function config(): Promise<CreationLimits | null> {
    if (!store) return null;
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = await store.getCreationLimits();
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'managed availability config unreadable; using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'managed availability config unreadable and never read; treating as unset');
      return null;
    }
  }

  async function baseAvailability(): Promise<ManagedAvailability> {
    const stored = await config();
    const mode = stored?.managedBuilderMode ?? 'auto';
    if (mode === 'off') return { available: false, reason: 'outage' };
    if (mode === 'coming_soon') return { available: false, reason: 'coming_soon' };
    if (!hasPlatformBackend) return { available: false, reason: 'coming_soon' };
    // A built backend alone doesn't mean one is actually selected.
    if (!(await resolveVendor())) return { available: false, reason: 'coming_soon' };
    return { available: true };
  }

  async function checkCaps(uid: string, dateStr: string, spend: boolean): Promise<ManagedAvailability> {
    // Automation keeps its own allowance, not an unbounded pass.
    if (bypassesBreaker(uid)) {
      if (!store) return { available: true };
      try {
        const cap = resolveDefaultGlobalDailyBotCallCap();
        if (cap > 0 && !(await store.checkAndIncrementGlobalBotCalls(dateStr, cap)).allowed) {
          return { available: false, reason: 'global_limit' };
        }
      } catch (error) {
        logWarn({ err: error, dateStr }, 'automation counter unreachable; admitting the managed round');
      }
      return { available: true };
    }
    if (!store) return { available: true };

    const stored = await config();
    // Unset used to mean unlimited, alone among the gates.
    const globalCap = stored?.managedDailyCap ?? DEFAULT_MANAGED_DAILY_CAP;
    const userCap = stored?.managedDailyUserCap ?? DEFAULT_MANAGED_DAILY_USER_CAP;

    // Checked first: an exhausted creator must never spend the shared slot.
    if (userCap !== null) {
      let allowed: boolean;
      try {
        if (spend) {
          allowed = (await store.checkAndIncrementQuota(uid, dateStr, userCap, 'managedBuilds')).allowed;
        } else {
          allowed = (await store.getUsage(uid, dateStr)).managedBuilds < userCap;
        }
      } catch (error) {
        logWarn({ err: error, uid, dateStr }, 'per-creator managed build counter unreachable; admitting the request');
        allowed = true;
      }
      if (!allowed) return { available: false, reason: 'user_limit' };
    }

    // Counted even uncapped, for an accurate admin count; enforced only when capped.
    const globalLimit = globalCap ?? Infinity;
    let globalAllowed: boolean;
    try {
      if (spend) {
        globalAllowed = (await store.checkAndIncrementGlobalManagedBuilds(dateStr, globalLimit)).allowed;
      } else {
        globalAllowed = (await store.getGlobalManagedBuildCount(dateStr)) < globalLimit;
      }
    } catch (error) {
      logWarn({ err: error, dateStr }, 'global managed build counter unreachable; admitting the request');
      globalAllowed = true;
    }
    if (!globalAllowed) return { available: false, reason: 'global_limit' };

    return { available: true };
  }

  async function resolve(uid: string, dateStr: string, spend: boolean): Promise<ManagedAvailability> {
    const base = await baseAvailability();
    if (!base.available) return base;
    return checkCaps(uid, dateStr, spend);
  }

  async function resolveVendor(): Promise<string | undefined> {
    const stored = await config();
    const override = stored?.managedAgentVendorOverride;
    if (override && configuredVendors?.has(override)) return override;
    // defaultVendor may not have actually built; verify before returning it.
    return defaultVendor && configuredVendors?.has(defaultVendor) ? defaultVendor : undefined;
  }

  return {
    peek: (uid, dateStr) => resolve(uid, dateStr, false),
    checkAndSpend: (uid, dateStr) => resolve(uid, dateStr, true),
    resolveVendor,
  };
}

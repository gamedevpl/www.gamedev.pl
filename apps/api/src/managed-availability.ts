// Whether the `platform` builder (the Gamedev.pl-run coding agent) can be offered right
// now — as opposed to `self` (BYOCA), which needs no backend and is always available.
//
// Reuses the creation-limits chassis: the switch lives on the same `opsConfig/creationLimits`
// document, read with the same short TTL, so an operator pulling it during an incident and
// an operator pulling the creation breaker are looking at the same console panel. See
// creation-limits.ts for why a document rather than an env var.

import { BOT_UID_PREFIX, type CreationLimits, type Store } from './store.js';

export type ManagedUnavailableReason = 'coming_soon' | 'outage' | 'global_limit' | 'user_limit';

export type ManagedAvailability = { available: true } | { available: false; reason: ManagedUnavailableReason };

/** Wire error code for a request that named `builder: 'platform'` while it is unavailable. */
export const MANAGED_UNAVAILABLE_ERROR = 'platform_builder_unavailable';

export const DEFAULT_MANAGED_AVAILABILITY_TTL_MS = 60_000;

export interface ManagedAvailabilityOptions {
  /** Absent only in tests with no backing store; caps and the ops-doc mode are skipped. */
  store?: Store;
  now?: () => number;
  ttlMs?: number;
  /**
   * Whether this environment actually has a platform backend wired (the registry's
   * `platform` entry). A missing backend reads as `coming_soon`, not `outage` — an
   * unconfigured environment is a feature that has not launched here, not an incident.
   */
  hasPlatformBackend: boolean;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface ManagedAvailabilityGate {
  /** Read-only — never spends a slot. For quota/status display and pre-flight UI checks. */
  peek(uid: string, dateStr: string): Promise<ManagedAvailability>;
  /**
   * Same checks as {@link peek}, but spends the global and per-creator daily slot on
   * success. Call this once, right before a fresh platform dispatch — never for a round
   * that is only continuing (an in-flight platform round keeps running when the switch
   * flips; this gates new dispatches, not existing ones).
   */
  checkAndSpend(uid: string, dateStr: string): Promise<ManagedAvailability>;
}

function bypassesBreaker(uid: string): boolean {
  return uid.startsWith(BOT_UID_PREFIX);
}

export function createManagedAvailabilityGate(options: ManagedAvailabilityOptions): ManagedAvailabilityGate {
  const { store, hasPlatformBackend } = options;
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

  /** The switch and configuration state, ahead of any per-day counting. */
  async function baseAvailability(): Promise<ManagedAvailability> {
    const stored = await config();
    const mode = stored?.managedBuilderMode ?? 'auto';
    if (mode === 'off') return { available: false, reason: 'outage' };
    if (mode === 'coming_soon') return { available: false, reason: 'coming_soon' };
    if (!hasPlatformBackend) return { available: false, reason: 'coming_soon' };
    return { available: true };
  }

  async function checkCaps(uid: string, dateStr: string, spend: boolean): Promise<ManagedAvailability> {
    if (bypassesBreaker(uid)) return { available: true };
    if (!store) return { available: true };

    const stored = await config();
    const globalCap = stored?.managedDailyCap ?? null;
    const userCap = stored?.managedDailyUserCap ?? null;

    if (globalCap !== null) {
      let allowed: boolean;
      try {
        if (spend) {
          allowed = (await store.checkAndIncrementGlobalManagedBuilds(dateStr, globalCap)).allowed;
        } else {
          allowed = (await store.getGlobalManagedBuildCount(dateStr)) < globalCap;
        }
      } catch (error) {
        logWarn({ err: error, dateStr }, 'global managed build counter unreachable; admitting the request');
        allowed = true;
      }
      if (!allowed) return { available: false, reason: 'global_limit' };
    }

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

    return { available: true };
  }

  async function resolve(uid: string, dateStr: string, spend: boolean): Promise<ManagedAvailability> {
    const base = await baseAvailability();
    if (!base.available) return base;
    return checkCaps(uid, dateStr, spend);
  }

  return {
    peek: (uid, dateStr) => resolve(uid, dateStr, false),
    checkAndSpend: (uid, dateStr) => resolve(uid, dateStr, true),
  };
}

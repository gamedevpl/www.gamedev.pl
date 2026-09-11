// Whether round 0 runs right now, and which provider answers it.

import type { CreationLimits, Store } from '../platform/store.js';

export const DEFAULT_SEED_AVAILABILITY_TTL_MS = 60_000;

export interface SeedAvailabilityOptions {
  // Absent only in tests with no store; seeding reads as enabled.
  store?: Store;
  now?: () => number;
  ttlMs?: number;
  // Vendors with a real provider config at boot; vertex is always here.
  configuredProviders: ReadonlySet<string>;
  // What resolveProvider() returns when no valid override is stored.
  defaultProvider: string;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

// A seed is our priciest call; on/off was its only bound.
export const DEFAULT_GLOBAL_DAILY_SEED_CAP = 300;

export function resolveDefaultGlobalDailySeedCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GLOBAL_DAILY_SEED_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_SEED_CAP;
}

export interface SeedAvailabilityGate {
  // False means: do not attempt a seed. Round 0's kill switch.
  seedingEnabled(): Promise<boolean>;
  // Spends a seed slot immediately before a paid pipeline runs.
  spendSeedSlot(dateStr: string): Promise<boolean>;
  // Stored override if configured, else the default. Never an unconfigured id.
  resolveProvider(): Promise<string>;
}

export function createSeedAvailabilityGate(options: SeedAvailabilityOptions): SeedAvailabilityGate {
  const { store, configuredProviders, defaultProvider } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_SEED_AVAILABILITY_TTL_MS;
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
        logWarn({ err: error }, 'seed availability config unreadable; using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'seed availability config unreadable and never read; treating as unset');
      return null;
    }
  }

  async function seedingEnabled(): Promise<boolean> {
    const stored = await config();
    return (stored?.seedingMode ?? 'auto') !== 'off';
  }

  async function spendSeedSlot(dateStr: string): Promise<boolean> {
    if (!store) return true;
    const stored = await config();
    const cap = stored?.globalDailySeedCap ?? resolveDefaultGlobalDailySeedCap();
    if (cap <= 0) return false;
    try {
      const spent = await store.checkAndIncrementGlobalSeeds(dateStr, cap);
      if (!spent.allowed) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily seed cap reached; refusing seed pipelines');
        return false;
      }
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily seed cap is over 80% spent');
      }
      return true;
    } catch (error) {
      // A blip must not stop round 0; other caps hold.
      logWarn({ err: error, dateStr }, 'global seed counter unreachable; admitting the seed');
      return true;
    }
  }

  async function resolveProvider(): Promise<string> {
    const stored = await config();
    const override = stored?.seedProviderOverride;
    if (override && configuredProviders.has(override)) return override;
    return defaultProvider;
  }

  return { seedingEnabled, spendSeedSlot, resolveProvider };
}

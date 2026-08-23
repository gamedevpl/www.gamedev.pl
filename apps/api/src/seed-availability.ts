// Whether round 0 runs right now, and which provider answers it.

import type { CreationLimits, Store } from './platform/store.js';

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

export interface SeedAvailabilityGate {
  // False means: do not attempt a seed. Round 0's kill switch.
  seedingEnabled(): Promise<boolean>;
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

  async function resolveProvider(): Promise<string> {
    const stored = await config();
    const override = stored?.seedProviderOverride;
    if (override && configuredProviders.has(override)) return override;
    return defaultProvider;
  }

  return { seedingEnabled, resolveProvider };
}

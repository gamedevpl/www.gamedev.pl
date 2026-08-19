// Whether round 0 runs at all right now, and which provider answers it.
//
// Mirrors managed-availability.ts's shape one size smaller: seeding has no daily quota
// to spend (it rides the submission cap, not its own counter), so this gate is only the
// two decisions an operator actually needs mid-incident — kill it, or point it at a
// different vendor — both from the same ops-config document the managed builder reads,
// within the same TTL, with no redeploy. See ops/seed-provider-selection-plan.md SP-06.

import type { CreationLimits, Store } from './store.js';

export const DEFAULT_SEED_AVAILABILITY_TTL_MS = 60_000;

export interface SeedAvailabilityOptions {
  // Absent only in tests with no store; seeding then always reads as enabled/default.
  store?: Store;
  now?: () => number;
  ttlMs?: number;
  // Vendors with a real provider config at boot (agent-backend-env.ts). Vertex is always
  // in here — it authenticates with ambient ADC, not a stored credential.
  configuredProviders: ReadonlySet<string>;
  // SEED_PROVIDER, or DEFAULT_SEED_PROVIDER absent that — what resolveProvider() returns
  // when no override is stored, or the stored one names an unconfigured vendor.
  defaultProvider: string;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface SeedAvailabilityGate {
  // False means: do not attempt a seed at all. This is round 0's kill switch — see
  // "The finding that reorders this plan" in the plan doc for why one had to exist.
  seedingEnabled(): Promise<boolean>;
  // Provider a fresh seed attempt should use: stored override if it is configured, else
  // defaultProvider. Never throws, never returns an unconfigured id.
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

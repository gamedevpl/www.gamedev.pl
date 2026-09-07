import type { CreationLimits, Store } from '../platform/store.js';

export const DEFAULT_DREAM_AVAILABILITY_TTL_MS = 60_000;

// Frames, not proposals: a two-option proposal spends two.
export const DEFAULT_GLOBAL_DAILY_DREAM_CAP = 200;

export function resolveDefaultGlobalDailyDreamCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GLOBAL_DAILY_DREAM_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_DREAM_CAP;
}

export interface DreamAvailabilityOptions {
  store?: Store;
  now?: () => number;
  ttlMs?: number;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface DreamAvailabilityGate {
  // False means: do not dream. The operator's kill switch.
  dreamingEnabled(): Promise<boolean>;
  // Spends one frame from the day's shared allowance, or refuses.
  spendFrameSlot(dateStr: string): Promise<boolean>;
}

// Same chassis as seed availability: a platform job, not a request.
export function createDreamAvailabilityGate(options: DreamAvailabilityOptions): DreamAvailabilityGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_DREAM_AVAILABILITY_TTL_MS;
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
        logWarn({ err: error }, 'dream availability config unreadable; using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'dream availability config unreadable and never read; treating as unset');
      return null;
    }
  }

  async function dreamingEnabled(): Promise<boolean> {
    const stored = await config();
    return stored?.dreamsPaused !== true;
  }

  async function spendFrameSlot(dateStr: string): Promise<boolean> {
    if (!store) return true;
    const stored = await config();
    const cap = stored?.globalDailyDreamCap ?? resolveDefaultGlobalDailyDreamCap();
    if (cap <= 0) return false;
    try {
      const spent = await store.checkAndIncrementGlobalDreams(dateStr, cap);
      if (!spent.allowed) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily dream cap reached; refusing concept frames');
        return false;
      }
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily dream cap is over 80% spent');
      }
      return true;
    } catch (error) {
      // A blip means no frame, not a free one.
      logWarn({ err: error, dateStr }, 'global dream counter unreachable; skipping the frame');
      return false;
    }
  }

  return { dreamingEnabled, spendFrameSlot };
}

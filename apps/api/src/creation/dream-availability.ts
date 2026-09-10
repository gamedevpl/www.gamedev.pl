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
  // Spends `count` frames from the day's shared allowance, all or none.
  spendFrameSlots(dateStr: string, count: number): Promise<boolean>;
}

// Same chassis as seed availability: a platform job, not a request.
export function createDreamAvailabilityGate(options: DreamAvailabilityOptions): DreamAvailabilityGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_DREAM_AVAILABILITY_TTL_MS;
  const logWarn = options.logWarn ?? (() => {});

  let cache: { value: CreationLimits | null; expiresAt: number } | null = null;

  // Unknown is not unset: only one of the two may dream.
  type ConfigRead = { known: true; value: CreationLimits | null } | { known: false };

  async function config(): Promise<ConfigRead> {
    if (!store) return { known: true, value: null };
    if (cache && cache.expiresAt > now()) return { known: true, value: cache.value };
    try {
      const stored = await store.getCreationLimits();
      cache = { value: stored, expiresAt: now() + ttlMs };
      return { known: true, value: stored };
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'dream availability config unreadable; using the last known values');
        return { known: true, value: cache.value };
      }
      logWarn({ err: error }, 'dream availability config unreadable and never read; refusing to dream');
      return { known: false };
    }
  }

  async function dreamingEnabled(): Promise<boolean> {
    const read = await config();
    // An unread switch may be a set switch; guessing spends real money.
    if (!read.known) return false;
    return read.value?.dreamsPaused !== true;
  }

  async function spendFrameSlots(dateStr: string, count: number): Promise<boolean> {
    if (!store) return true;
    const read = await config();
    // The last look before the paid call; the pause may have landed.
    if (!read.known || read.value?.dreamsPaused === true) return false;
    const cap = read.value?.globalDailyDreamCap ?? resolveDefaultGlobalDailyDreamCap();
    if (cap <= 0) return false;
    try {
      const spent = await store.checkAndIncrementGlobalDreams(dateStr, cap, count);
      if (!spent.allowed) {
        logWarn(
          { dateStr, cap, count, current: spent.current },
          'global daily dream cap reached; refusing concept frames',
        );
        return false;
      }
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily dream cap is over 80% spent');
      }
      return true;
    } catch (error) {
      // A blip means no frame, not a free one.
      logWarn({ err: error, dateStr }, 'global dream counter unreachable; skipping the frames');
      return false;
    }
  }

  return { dreamingEnabled, spendFrameSlots };
}

import type { BackendLimiter } from 'genaicode/backend';
import type { CreationLimits, Store } from '../platform/store.js';

// The site mascot's own spend lane: one shared daily token ceiling.

// About a dollar a day at worst on a Flash-Lite model.
export const DEFAULT_GLOBAL_DAILY_ASSISTANT_TOKEN_CAP = 500_000;
export const DEFAULT_DAILY_ASSISTANT_PROMPT_QUOTA = 20;

const LIMITS_TTL_MS = 60_000;
// Bounds how stale the headroom peek behind GET /info may be.
const COUNT_TTL_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function envNumber(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveGlobalDailyAssistantTokenCap(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  return envNumber('GLOBAL_DAILY_ASSISTANT_TOKEN_CAP', DEFAULT_GLOBAL_DAILY_ASSISTANT_TOKEN_CAP, env);
}

export function resolveDailyAssistantPromptQuota(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  return envNumber('DAILY_ASSISTANT_PROMPT_QUOTA', DEFAULT_DAILY_ASSISTANT_PROMPT_QUOTA, env);
}

export interface SiteAssistantLimiterOptions {
  store: Store;
  now?: () => number;
  ttlMs?: number;
  defaultGlobalDailyCap?: number;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface SiteAssistantLimiter extends BackendLimiter {
  // Whether the operator document pauses the lane right now.
  paused(): Promise<boolean>;
}

// Unlike tab-complete, an unreachable counter refuses: uncounted spend never runs.
export function createSiteAssistantLimiter(options: SiteAssistantLimiterOptions): SiteAssistantLimiter {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? LIMITS_TTL_MS;
  const defaultCap = resolveGlobalDailyAssistantTokenCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const tomorrow = () => (Math.floor(now() / DAY_MS) + 1) * DAY_MS;

  let cache: { value: CreationLimits | null; expiresAt: number } | null = null;
  let counted: { dateStr: string; value: number; expiresAt: number } | null = null;

  // Holds of calls still running, oldest first, each with its day.
  const holds: { key: string | undefined; tokens: number; dateStr: string }[] = [];
  // The backend names no call: match a hold by key and size.
  function heldOn(key: string | undefined, reserved: number): string {
    const index = holds.findIndex((hold) => hold.key === key && hold.tokens === reserved);
    return index < 0 ? today() : holds.splice(index, 1)[0]!.dateStr;
  }

  // Null means unknown: the document was never readable, so refuse.
  async function limits(): Promise<{ paused: boolean; cap: number } | null> {
    if (!cache || cache.expiresAt <= now()) {
      try {
        cache = { value: await store.getCreationLimits(), expiresAt: now() + ttlMs };
      } catch (error) {
        if (!cache) {
          logWarn({ err: error }, 'creation limits unreadable and never read; site assistant refusing');
          return null;
        }
        logWarn({ err: error }, 'creation limits unreadable; site assistant using the last known values');
      }
    }
    const value = cache.value;
    return { paused: value?.assistantPaused === true, cap: value?.globalDailyAssistantTokenCap ?? defaultCap };
  }

  return {
    async paused() {
      const value = await limits();
      return !value || value.paused;
    },

    async check() {
      const value = await limits();
      if (!value || value.paused || value.cap <= 0) return { ok: false };
      const dateStr = today();
      try {
        if (!counted || counted.dateStr !== dateStr || counted.expiresAt <= now()) {
          const current = await store.getGlobalAssistantTokenCount(dateStr);
          counted = { dateStr, value: current, expiresAt: now() + Math.min(ttlMs, COUNT_TTL_MS) };
        }
        return counted.value >= value.cap ? { ok: false, resetsAt: tomorrow() } : { ok: true };
      } catch (error) {
        logWarn({ err: error, dateStr }, 'site assistant token counter unreachable; reporting no headroom');
        return { ok: false };
      }
    },

    async reserve(key, tokens) {
      const value = await limits();
      if (!value || value.paused || value.cap <= 0) return { ok: false };
      const dateStr = today();
      try {
        const held = await store.checkAndIncrementGlobalAssistantTokens(dateStr, tokens, value.cap);
        if (!held.allowed) {
          logWarn(
            { dateStr, cap: value.cap, current: held.current },
            'global daily site assistant token cap reached; refusing prompts',
          );
          counted = null;
          return { ok: false, resetsAt: tomorrow() };
        }
        if (held.current >= Math.ceil(value.cap * 0.8)) {
          logWarn(
            { dateStr, cap: value.cap, current: held.current },
            'global daily site assistant token cap is over 80% reserved',
          );
        }
        holds.push({ key, tokens, dateStr });
        return { ok: true };
      } catch (error) {
        logWarn({ err: error, dateStr }, 'site assistant token counter unreachable; refusing the call');
        return { ok: false };
      }
    },

    // Settles on the day that holds it, so midnight never loses usage.
    async spend(key, tokens, reserved) {
      const dateStr = heldOn(key, reserved);
      try {
        await store.adjustGlobalAssistantTokens(dateStr, tokens - reserved);
      } catch (error) {
        logWarn(
          { err: error, dateStr, tokens, reserved },
          'site assistant token counter unreachable; hold not released',
        );
      }
    },
  };
}

import { BOT_UID_PREFIX, type CreationLimits, type Store } from '../platform/store.js';
import { resolveDefaultGlobalDailyBotCallCap } from '../platform/bot-allowance.js';

/**
 * The global creation circuit-breaker (private ops repo, readiness item 6).
 *
 * Until now every ceiling on creation was per-user: N invited creators times a daily
 * quota of 5, which means total spend was bounded by nothing but the invite count. An
 * agent build is the most expensive thing the product does, so the arithmetic that
 * matters for opening the beta wider is the *aggregate*, and there was no number for
 * it — nor any way to stop creation short of editing an env var and redeploying, which
 * mid-incident also drops every party room in flight.
 *
 * So there are two controls here, and both are read from a Firestore document at
 * request time rather than from the environment:
 *
 *   paused                    — refuse creation outright
 *   globalDailySubmissionCap  — accept at most N submissions per UTC day, everyone
 *                               together
 *
 * ## Why a document, not an env var
 *
 * The whole value of a breaker is that pulling it is cheaper than the incident. An env
 * var needs a new Cloud Run revision: a minute or two of rollout, plus every live party
 * room dropped, to change a boolean. A document is a console edit that every instance
 * picks up within `ttlMs`. The cost is one document read per instance per TTL — at 60s
 * that is under 1,500 reads a day, which rounds to nothing against Firestore's free
 * tier, and the read is off the hot path for everything except creation.
 *
 * ## Failure and default behaviour
 *
 * A missing document is normal (nothing has ever been set) and means "not paused, use
 * the caller's default cap". An *unreadable* document serves the last value this
 * instance saw, and falls back to the default cap when it has never read one — the same
 * shape as the snapshot pointer's stale-on-error branch, and for the same reason: a
 * transient Firestore blip must not become a creation outage. What makes that safe is
 * that the default cap is a real number rather than infinity, so the fallback still has
 * a ceiling, and the per-user quota and per-IP limiter are untouched underneath.
 */

/** Applies when no document has been written, and when one cannot be read. */
export const DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP = 50;

/**
 * The editing lanes' shared daily allowance of paid model calls (assist + code,
 * Studio + remix together). Generous against expected use — the cost model puts
 * a heavy day in the hundreds — while capping the worst day at a number an
 * operator chose rather than one an incident discovers.
 */
export const DEFAULT_GLOBAL_DAILY_EDIT_CAP = 500;

/** How long a read config is trusted. The upper bound on how long a flip takes. */
export const DEFAULT_CREATION_LIMITS_TTL_MS = 60_000;

/**
 * The ceiling in force when the document sets none. Env-tunable so the *floor* can move
 * with a deploy while day-to-day changes need no deploy at all.
 *
 * A blank env var is "not configured", not zero — `Number('')` is 0, and reading that as
 * a cap of zero would close creation on an empty variable. An explicit `0` is honoured,
 * because "accept nothing" is a legitimate thing to want to say.
 */
export function resolveDefaultGlobalDailyCap(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_SUBMISSION_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP;
}

/** Same not-configured semantics as the submission cap resolver above. */
export function resolveDefaultGlobalDailyEditCap(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_EDIT_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_EDIT_CAP;
}

// Shared daily allowance of chat-agent calls — own cap, separate from editing.
export const DEFAULT_GLOBAL_DAILY_CHAT_CAP = 5000;

// Same not-configured semantics as the submission cap resolver above.
export function resolveDefaultGlobalDailyChatCap(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_CHAT_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_CHAT_CAP;
}

export type CreationRefusal = 'paused' | 'over_capacity';

export type CreationGateOutcome = { allowed: true } | { allowed: false; reason: CreationRefusal };

export interface CreationGateOptions {
  store: Store;
  now?: () => number;
  /** Config cache lifetime; tests set it to 0 or step a clock past it. */
  ttlMs?: number;
  /** Ceiling used when the document says nothing; defaults via GLOBAL_DAILY_SUBMISSION_CAP. */
  defaultGlobalDailyCap?: number;
  /** Structured warning sink — the operator's early notice that the day is filling up. */
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface CreationGate {
  /**
   * Decides, and on success **spends** one of the day's global slots. Call it after
   * moderation and before the per-user quota or any GitHub write, so a refusal costs
   * the creator nothing.
   */
  checkAndSpend(uid: string, dateStr: string): Promise<CreationGateOutcome>;
  /** The effective config, cache included — what the operator surface reports. */
  readLimits(): Promise<CreationLimits & { source: 'stored' | 'default' }>;
}

// Automation stays outside the creator ceilings and the pause, not outside every cap.

// A pause is incident response; the deploy's own smoke checks run as `bot:`.

// So bot spend goes against its own counter, leaving the creator allowance alone.
function isAutomationAccount(uid: string): boolean {
  return uid.startsWith(BOT_UID_PREFIX);
}


// Never consults a pause: it must not block the deploy that fixes the incident.
async function spendBotAllowance(
  store: Store,
  dateStr: string,
  logWarn: (payload: Record<string, unknown>, message: string) => void,
): Promise<CreationGateOutcome> {
  const cap = resolveDefaultGlobalDailyBotCallCap();
  if (cap <= 0) return { allowed: true };
  try {
    const spent = await store.checkAndIncrementGlobalBotCalls(dateStr, cap);
    if (!spent.allowed) {
      logWarn({ dateStr, cap, current: spent.current }, 'global daily automation cap reached; refusing bot calls');
      return { allowed: false, reason: 'over_capacity' };
    }
    if (spent.current >= Math.ceil(cap * 0.8)) {
      logWarn({ dateStr, cap, current: spent.current }, 'global daily automation cap is over 80% spent');
    }
    return { allowed: true };
  } catch (error) {
    // A blip must never be what stops a deploy smoke check.
    logWarn({ err: error, dateStr }, 'automation counter unreachable; admitting the bot call');
    return { allowed: true };
  }
}

export function createCreationGate(options: CreationGateOptions): CreationGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailyCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<{ value: CreationLimits; source: 'stored' | 'default' }> {
    if (cache && cache.expiresAt > now()) {
      return { value: cache.value, source: 'stored' };
    }
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return { value: stored, source: 'stored' };
    } catch (error) {
      if (cache) {
        // Stale beats an outage: the value changes only when an operator changes it.
        logWarn({ err: error }, 'creation limits unreadable; using the last known values');
        return { value: cache.value, source: 'stored' };
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; using defaults');
      return { value: defaults, source: 'default' };
    }
  }

  return {
    async readLimits() {
      const { value, source } = await limits();
      return { ...value, source };
    },

    async checkAndSpend(uid, dateStr) {
      if (isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);

      const { value } = await limits();
      if (value.paused) {
        return { allowed: false, reason: 'paused' };
      }

      const cap = value.globalDailySubmissionCap ?? defaultCap;
      // A cap of 0 is a legitimate way to say "closed", and negative is nonsense that
      // should also close rather than silently open.
      if (cap <= 0) {
        return { allowed: false, reason: 'over_capacity' };
      }

      let spent: { allowed: boolean; current: number };
      try {
        spent = await store.checkAndIncrementGlobalSubmissions(dateStr, cap);
      } catch (error) {
        // The counter is unreachable. Admitting the request is right: the per-user
        // quota still applies, and a Firestore blip must not read as "the whole
        // product is over capacity" — a submission cannot be recorded at all in that
        // state, so the request is about to fail on its own terms anyway.
        logWarn({ err: error, dateStr }, 'global submission counter unreachable; admitting the request');
        return { allowed: true };
      }

      if (!spent.allowed) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily creation cap reached; refusing submissions');
        return { allowed: false, reason: 'over_capacity' };
      }

      // The point of warning early is that the alternative — noticing when creators
      // start being refused — means the first person to find out is a creator.
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily creation cap is over 80% spent');
      }

      return { allowed: true };
    },
  };
}

export interface EditingGate {
  /** Decides and spends one of the day's editing-model slots, or refuses. */
  checkAndSpend(uid: string, dateStr: string): Promise<CreationGateOutcome>;
  // Read-only headroom check, for use before a paid classifier runs.
  peek(uid: string, dateStr: string): Promise<CreationGateOutcome>;
  /**
   * Whether the operator has closed the code-lane trace window.
   *
   * The trace is turned *on* by a deploy-threaded env flag — deliberate and
   * slow, which is right for opening it. Turning it off must not need a
   * release: clearing the repository variable changes nothing on a revision
   * already running, and the interval between "I turned it off" and "it is off"
   * is spent writing players' words to the log. So off lives here, in the same
   * document the breaker uses, and takes effect within its TTL.
   */
  isTracePaused(): Promise<boolean>;
}

/**
 * The editing lanes' circuit breaker — the same chassis as creation's, reading
 * the same document (one place to look during an incident), tripping a
 * different pair of fields. Built BEFORE the remix flags go on, deliberately:
 * the flag-on hand test is exactly the moment a runaway loop or a probing
 * script would first meet real spend, and the breaker is what makes that day
 * cost a known number.
 */
export function createEditingGate(options: CreationGateOptions): EditingGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailyEditCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    remixTracePaused: false,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<CreationLimits> {
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'creation limits unreadable; editing gate using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; editing gate using defaults');
      return defaults;
    }
  }

  return {
    async isTracePaused() {
      return (await limits()).remixTracePaused === true;
    },

    async peek(uid, dateStr) {
      if (isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);

      const value = await limits();
      if (value.editingPaused) return { allowed: false, reason: 'paused' };

      const cap = value.globalDailyEditCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };

      try {
        const current = await store.getGlobalEditCount(dateStr);
        return current >= cap ? { allowed: false, reason: 'over_capacity' } : { allowed: true };
      } catch (error) {
        // Never authoritative: checkAndSpend decides, this only avoids paying first.
        logWarn({ err: error, dateStr }, 'global edit counter unreachable; skipping the headroom peek');
        return { allowed: true };
      }
    },

    async checkAndSpend(uid, dateStr) {
      if (isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);

      const value = await limits();
      if (value.editingPaused) return { allowed: false, reason: 'paused' };

      const cap = value.globalDailyEditCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };

      let spent: { allowed: boolean; current: number };
      try {
        spent = await store.checkAndIncrementGlobalEdits(dateStr, cap);
      } catch (error) {
        // Same reasoning as creation: a Firestore blip must not read as "over
        // capacity" — per-user quotas and rate limits still hold underneath.
        logWarn({ err: error, dateStr }, 'global edit counter unreachable; admitting the request');
        return { allowed: true };
      }

      if (!spent.allowed) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily edit cap reached; refusing editing calls');
        return { allowed: false, reason: 'over_capacity' };
      }
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily edit cap is over 80% spent');
      }
      return { allowed: true };
    },
  };
}

export interface ChatGate {
  // Decides and spends one of the day's chat-agent slots.
  checkAndSpend(uid: string, dateStr: string): Promise<CreationGateOutcome>;
}

// Same chassis as creation/editing; falls open in runChatAgent on refusal.
export function createChatGate(options: CreationGateOptions): ChatGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailyChatCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    chatPaused: false,
    globalDailyChatCap: null,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<CreationLimits> {
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'creation limits unreadable; chat gate using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; chat gate using defaults');
      return defaults;
    }
  }

  return {
    async checkAndSpend(uid, dateStr) {
      if (isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);

      const value = await limits();
      if (value.chatPaused) return { allowed: false, reason: 'paused' };

      const cap = value.globalDailyChatCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };

      let spent: { allowed: boolean; current: number };
      try {
        spent = await store.checkAndIncrementGlobalChats(dateStr, cap);
      } catch (error) {
        // Same reasoning as creation/editing — a blip is not "over capacity".
        logWarn({ err: error, dateStr }, 'global chat counter unreachable; admitting the request');
        return { allowed: true };
      }

      if (!spent.allowed) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily chat cap reached; refusing chat-agent calls');
        return { allowed: false, reason: 'over_capacity' };
      }
      if (spent.current >= Math.ceil(cap * 0.8)) {
        logWarn({ dateStr, cap, current: spent.current }, 'global daily chat cap is over 80% spent');
      }
      return { allowed: true };
    },
  };
}

// A deliberate cap the owner chose for this lane, not a fallback.
export const DEFAULT_GLOBAL_DAILY_TAB_COMPLETE_TOKEN_CAP = 2_000_000;

export function resolveDefaultGlobalDailyTabCompleteTokenCap(
  override?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_TAB_COMPLETE_TOKEN_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_TAB_COMPLETE_TOKEN_CAP;
}

// Anonymous search has no per-user quota beneath it.
export const DEFAULT_GLOBAL_DAILY_SEARCH_EMBEDDING_CAP = 20_000;

// Same not-configured semantics as the submission cap resolver above.
export function resolveDefaultGlobalDailySearchEmbeddingCap(
  override?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_SEARCH_EMBEDDING_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_SEARCH_EMBEDDING_CAP;
}

// Worst-case request cost: prefix + suffix chars plus the output cap.
export const TAB_COMPLETE_TOKEN_RESERVATION = 1400;

export type TabCompletePeekOutcome = { allowed: true; reserved: boolean } | { allowed: false; reason: CreationRefusal };

export interface TabCompleteGate {
  // Reserves a worst-case slot; reserved=false if none was recorded.
  peek(uid: string, dateStr: string): Promise<TabCompletePeekOutcome>;
  // Reconciles the reservation. Pass the `reserved` flag peek() returned.
  spend(uid: string, dateStr: string, tokens: number, reserved: boolean): Promise<void>;
}

// Same chassis as editing/chat, denominated in tokens rather than calls.
export function createTabCompleteGate(options: CreationGateOptions): TabCompleteGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailyTabCompleteTokenCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    tabCompletePaused: false,
    globalDailyTabCompleteTokenCap: null,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<CreationLimits> {
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'creation limits unreadable; tab-complete gate using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; tab-complete gate using defaults');
      return defaults;
    }
  }

  return {
    async peek(uid, dateStr) {
      if (isAutomationAccount(uid)) {
        const bot = await spendBotAllowance(store, dateStr, logWarn);
        return bot.allowed ? { allowed: true, reserved: false } : { allowed: false, reason: bot.reason };
      }
      const value = await limits();
      if (value.tabCompletePaused) return { allowed: false, reason: 'paused' };
      const cap = value.globalDailyTabCompleteTokenCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };
      try {
        const spent = await store.checkAndIncrementGlobalTabCompleteTokens(
          dateStr,
          TAB_COMPLETE_TOKEN_RESERVATION,
          cap,
        );
        if (!spent.allowed) {
          logWarn(
            { dateStr, cap, current: spent.current },
            'global daily tab-complete token cap reached; refusing completions',
          );
          return { allowed: false, reason: 'over_capacity' };
        }
        return { allowed: true, reserved: true };
      } catch (error) {
        // A blip is not over capacity; nothing was reserved to release.
        logWarn({ err: error, dateStr }, 'global tab-complete token counter unreachable; admitting the request');
        return { allowed: true, reserved: false };
      }
    },

    async spend(uid, dateStr, tokens, reserved) {
      if (isAutomationAccount(uid)) return;
      const value = await limits();
      const cap = value.globalDailyTabCompleteTokenCap ?? defaultCap;
      // Only release a reservation that peek() actually recorded.
      const delta = reserved ? tokens - TAB_COMPLETE_TOKEN_RESERVATION : tokens;
      try {
        const current = await store.adjustGlobalTabCompleteTokens(dateStr, delta);
        if (current >= Math.ceil(cap * 0.8)) {
          logWarn({ dateStr, cap, current }, 'global daily tab-complete token cap is over 80% spent');
        }
      } catch (error) {
        logWarn({ err: error, dateStr }, 'global tab-complete token counter unreachable; usage not recorded');
      }
    },
  };
}

export interface SearchGate {
  // Call before embedQuery; null uid is anonymous, counted globally only.
  checkAndSpend(uid: string | null, dateStr: string): Promise<CreationGateOutcome>;
}

// Same chassis as the editing and chat gates, guarding query embeddings.
export function createSearchGate(options: CreationGateOptions): SearchGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailySearchEmbeddingCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    searchPaused: false,
    globalDailySearchEmbeddingCap: null,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<CreationLimits> {
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'creation limits unreadable; search gate using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; search gate using defaults');
      return defaults;
    }
  }

  return {
    async checkAndSpend(uid, dateStr) {
      if (uid !== null && isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);
      const value = await limits();
      if (value.searchPaused) return { allowed: false, reason: 'paused' };
      const cap = value.globalDailySearchEmbeddingCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };
      try {
        const spent = await store.checkAndIncrementGlobalSearchEmbeddings(dateStr, cap);
        if (!spent.allowed) {
          logWarn(
            { dateStr, cap, current: spent.current },
            'global daily search embedding cap reached; serving search without embeddings',
          );
          return { allowed: false, reason: 'over_capacity' };
        }
        if (spent.current >= Math.ceil(cap * 0.8)) {
          logWarn({ dateStr, cap, current: spent.current }, 'global daily search embedding cap is over 80% spent');
        }
        return { allowed: true };
      } catch (error) {
        // A blip is not over capacity; admitting it must stay greppable.
        logWarn(
          { err: error, dateStr },
          'global search embedding counter unreachable; admitting the request uncounted',
        );
        return { allowed: true };
      }
    },
  };
}

// Each gate run is a 30-minute E2_HIGHCPU_8 build; nothing counted them.
export const DEFAULT_GLOBAL_DAILY_GATE_RUN_CAP = 400;

// Same not-configured semantics as the submission cap resolver above.
export function resolveDefaultGlobalDailyGateRunCap(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
  const raw = env.GLOBAL_DAILY_GATE_RUN_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_GATE_RUN_CAP;
}

export interface GateRunGate {
  // Spends a gate-build slot immediately before one starts.
  checkAndSpend(uid: string, dateStr: string): Promise<CreationGateOutcome>;
  // Read-only headroom, for refusing a delivery before it writes anything.
  peek(uid: string, dateStr: string): Promise<CreationGateOutcome>;
}

// Same chassis as the other breakers, guarding Cloud Build minutes.
export function createGateRunGate(options: CreationGateOptions): GateRunGate {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const defaultCap = resolveDefaultGlobalDailyGateRunCap(options.defaultGlobalDailyCap);
  const logWarn = options.logWarn ?? (() => {});

  const defaults: CreationLimits = {
    paused: false,
    globalDailySubmissionCap: null,
    editingPaused: false,
    globalDailyEditCap: null,
    gatePaused: false,
    globalDailyGateRunCap: null,
    managedDailyCap: null,
    managedDailyUserCap: null,
  };
  let cache: { value: CreationLimits; expiresAt: number } | null = null;

  async function limits(): Promise<CreationLimits> {
    if (cache && cache.expiresAt > now()) return cache.value;
    try {
      const stored = (await store.getCreationLimits()) ?? defaults;
      cache = { value: stored, expiresAt: now() + ttlMs };
      return stored;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'creation limits unreadable; gate-run gate using the last known values');
        return cache.value;
      }
      logWarn({ err: error }, 'creation limits unreadable and never read; gate-run gate using defaults');
      return defaults;
    }
  }

  return {
    async peek(uid, dateStr) {
      if (isAutomationAccount(uid)) return { allowed: true };
      const value = await limits();
      if (value.gatePaused) return { allowed: false, reason: 'paused' };
      const cap = value.globalDailyGateRunCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };
      try {
        const current = await store.getGlobalGateRunCount(dateStr);
        return current >= cap ? { allowed: false, reason: 'over_capacity' } : { allowed: true };
      } catch (error) {
        // Never authoritative: checkAndSpend decides when the build actually starts.
        logWarn({ err: error, dateStr }, 'global gate-run counter unreachable; skipping the headroom peek');
        return { allowed: true };
      }
    },

    async checkAndSpend(uid, dateStr) {
      if (isAutomationAccount(uid)) return spendBotAllowance(store, dateStr, logWarn);
      const value = await limits();
      if (value.gatePaused) return { allowed: false, reason: 'paused' };
      const cap = value.globalDailyGateRunCap ?? defaultCap;
      if (cap <= 0) return { allowed: false, reason: 'over_capacity' };
      try {
        const spent = await store.checkAndIncrementGlobalGateRuns(dateStr, cap);
        if (!spent.allowed) {
          logWarn({ dateStr, cap, current: spent.current }, 'global daily gate-run cap reached; refusing deliveries');
          return { allowed: false, reason: 'over_capacity' };
        }
        if (spent.current >= Math.ceil(cap * 0.8)) {
          logWarn({ dateStr, cap, current: spent.current }, 'global daily gate-run cap is over 80% spent');
        }
        return { allowed: true };
      } catch (error) {
        // A blip must not stop deliveries; other caps still hold.
        logWarn({ err: error, dateStr }, 'global gate-run counter unreachable; admitting the delivery');
        return { allowed: true };
      }
    },
  };
}

/** Wire error codes, so the web app can say something true about which limit was hit. */
export const CREATION_REFUSAL_CODES: Record<CreationRefusal, string> = {
  paused: 'creation_paused',
  over_capacity: 'creation_over_capacity',
};

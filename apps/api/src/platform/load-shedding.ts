import type { Store } from './store.js';

// Same trust window as the creation breaker; one document, one TTL.
export const DEFAULT_LOAD_SHED_TTL_MS = 60_000;

export interface LoadShedOptions {
  store: Pick<Store, 'getCreationLimits'>;
  now?: () => number;
  ttlMs?: number;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface LoadShedControls {
  // False drops this visit's telemetry writes for the whole visit.
  keepsVisitTelemetry(visitId: string): Promise<boolean>;
  // True while an operator has party hosting closed.
  refusesNewRooms(): Promise<boolean>;
  // True while preview video is withheld: the largest object we serve.
  refusesVideo(): Promise<boolean>;
  // True while every image request is answered with the smallest baked variant.
  servesLeanMedia(): Promise<boolean>;
  // True while the site is closed to visitors without a session.
  refusesAnonymous(): Promise<boolean>;
}

// One read, so two questions cost one document.
interface ShedState {
  sampleRate: number | null;
  partyPaused: boolean;
  videoPaused: boolean;
  mediaLean: boolean;
  anonymousPaused: boolean;
}

const SHEDS_NOTHING: ShedState = {
  sampleRate: null,
  partyPaused: false,
  videoPaused: false,
  mediaLean: false,
  anonymousPaused: false,
};

// FNV-1a: one visit lands in the same bucket on every flush.
function visitFraction(visitId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < visitId.length; index += 1) {
    hash ^= visitId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

// Whole visits, not single flushes: half a visit reads wrong.
export function sampleKeepsVisit(visitId: string, rate: number | null | undefined): boolean {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate >= 1) return true;
  if (rate <= 0) return false;
  return visitFraction(visitId) < rate;
}

// The ladder's rungs; see docs/runbooks/launch-day.md.
export function createLoadShedControls(options: LoadShedOptions): LoadShedControls {
  const { store } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_LOAD_SHED_TTL_MS;
  const logWarn = options.logWarn ?? (() => {});

  let cache: (ShedState & { expiresAt: number }) | null = null;

  // Fails open: every rung here defaults to serving.
  async function read(): Promise<ShedState> {
    if (cache && cache.expiresAt > now()) return cache;
    try {
      const stored = await store.getCreationLimits();
      const value: ShedState = {
        sampleRate: stored?.telemetrySampleRate ?? null,
        partyPaused: stored?.partyPaused === true,
        videoPaused: stored?.videoPaused === true,
        mediaLean: stored?.mediaLean === true,
        anonymousPaused: stored?.anonymousPaused === true,
      };
      cache = { ...value, expiresAt: now() + ttlMs };
      return value;
    } catch (error) {
      // Serve stale, move the deadline; else every request retries.
      if (cache) {
        cache.expiresAt = now() + ttlMs;
        logWarn({ err: error }, 'load-shedding config unreadable; using the last known values');
        return cache;
      }
      cache = { ...SHEDS_NOTHING, expiresAt: now() + ttlMs };
      logWarn({ err: error }, 'load-shedding config unreadable and never read; shedding nothing');
      return SHEDS_NOTHING;
    }
  }

  return {
    async keepsVisitTelemetry(visitId) {
      return sampleKeepsVisit(visitId, (await read()).sampleRate);
    },

    async refusesNewRooms() {
      return (await read()).partyPaused;
    },

    async refusesVideo() {
      return (await read()).videoPaused;
    },

    async servesLeanMedia() {
      return (await read()).mediaLean;
    },

    async refusesAnonymous() {
      return (await read()).anonymousPaused;
    },
  };
}

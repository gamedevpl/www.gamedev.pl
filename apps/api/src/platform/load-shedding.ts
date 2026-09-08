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
}

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

  let cache: { sampleRate: number | null; partyPaused: boolean; expiresAt: number } | null = null;

  // Fails open on purpose: an unreadable document must not close party mode.
  async function read(): Promise<{ sampleRate: number | null; partyPaused: boolean }> {
    if (cache && cache.expiresAt > now()) return cache;
    try {
      const stored = await store.getCreationLimits();
      const value = {
        sampleRate: stored?.telemetrySampleRate ?? null,
        partyPaused: stored?.partyPaused === true,
      };
      cache = { ...value, expiresAt: now() + ttlMs };
      return value;
    } catch (error) {
      if (cache) {
        logWarn({ err: error }, 'load-shedding config unreadable; using the last known values');
        return cache;
      }
      logWarn({ err: error }, 'load-shedding config unreadable and never read; shedding nothing');
      return { sampleRate: null, partyPaused: false };
    }
  }

  return {
    async keepsVisitTelemetry(visitId) {
      return sampleKeepsVisit(visitId, (await read()).sampleRate);
    },

    async refusesNewRooms() {
      return (await read()).partyPaused;
    },
  };
}

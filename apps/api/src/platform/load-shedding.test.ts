import { describe, expect, it } from 'vitest';
import { createLoadShedControls, sampleKeepsVisit } from './load-shedding.js';
import type { CreationLimits } from './store.js';

const A_VISIT = '0f2b7c1e-0000-4000-8000-000000000001';
const ANOTHER_VISIT = '0f2b7c1e-0000-4000-8000-000000000002';

function storeReturning(limits: Partial<CreationLimits> | null, onRead?: () => void) {
  return {
    async getCreationLimits() {
      onRead?.();
      return limits as CreationLimits | null;
    },
  };
}

describe('sampleKeepsVisit', () => {
  it('keeps everything when no rate is stored', () => {
    expect(sampleKeepsVisit(A_VISIT, null)).toBe(true);
    expect(sampleKeepsVisit(A_VISIT, undefined)).toBe(true);
    expect(sampleKeepsVisit(A_VISIT, 1)).toBe(true);
  });

  it('drops everything at zero', () => {
    expect(sampleKeepsVisit(A_VISIT, 0)).toBe(false);
    expect(sampleKeepsVisit(ANOTHER_VISIT, 0)).toBe(false);
  });

  it('decides a visit the same way every flush', () => {
    const first = sampleKeepsVisit(A_VISIT, 0.5);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(sampleKeepsVisit(A_VISIT, 0.5)).toBe(first);
    }
  });

  it('keeps roughly the requested share across many visits', () => {
    const visits = Array.from({ length: 2000 }, (_, index) => `visit-${index}`);
    const kept = visits.filter((visit) => sampleKeepsVisit(visit, 0.25)).length;
    expect(kept / visits.length).toBeGreaterThan(0.2);
    expect(kept / visits.length).toBeLessThan(0.3);
  });

  it('treats a nonsense rate as no sampling rather than a blackout', () => {
    expect(sampleKeepsVisit(A_VISIT, Number.NaN)).toBe(true);
  });
});

describe('load-shedding controls', () => {
  it('sheds nothing when the document is empty', async () => {
    const controls = createLoadShedControls({ store: storeReturning(null) });
    expect(await controls.keepsVisitTelemetry(A_VISIT)).toBe(true);
    expect(await controls.refusesNewRooms()).toBe(false);
  });

  it('refuses new rooms once an operator pauses party hosting', async () => {
    const controls = createLoadShedControls({ store: storeReturning({ partyPaused: true }) });
    expect(await controls.refusesNewRooms()).toBe(true);
  });

  it('drops sampled-out visits whole', async () => {
    const controls = createLoadShedControls({ store: storeReturning({ telemetrySampleRate: 0 }) });
    expect(await controls.keepsVisitTelemetry(A_VISIT)).toBe(false);
  });

  it('reads the document once per ttl', async () => {
    let reads = 0;
    let clock = 1_000;
    const controls = createLoadShedControls({
      store: storeReturning({ partyPaused: true }, () => (reads += 1)),
      now: () => clock,
      ttlMs: 60_000,
    });
    await controls.refusesNewRooms();
    await controls.refusesNewRooms();
    expect(reads).toBe(1);
    clock += 60_001;
    await controls.refusesNewRooms();
    expect(reads).toBe(2);
  });

  it('serves the last known values when the document goes unreadable', async () => {
    let fail = false;
    const controls = createLoadShedControls({
      store: {
        async getCreationLimits() {
          if (fail) throw new Error('firestore is down');
          return { partyPaused: true } as CreationLimits;
        },
      },
      ttlMs: 0,
    });
    expect(await controls.refusesNewRooms()).toBe(true);
    fail = true;
    expect(await controls.refusesNewRooms()).toBe(true);
  });

  it('sheds nothing when the document was never readable', async () => {
    const controls = createLoadShedControls({
      store: {
        async getCreationLimits(): Promise<CreationLimits | null> {
          throw new Error('firestore is down');
        },
      },
    });
    expect(await controls.refusesNewRooms()).toBe(false);
    expect(await controls.keepsVisitTelemetry(A_VISIT)).toBe(true);
  });
});

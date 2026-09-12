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

  // A failed refresh costs one read per TTL, not one per request.
  it('retries at most once per TTL after a failed refresh', async () => {
    let reads = 0;
    let clock = 0;
    const controls = createLoadShedControls({
      now: () => clock,
      ttlMs: 1_000,
      store: {
        async getCreationLimits(): Promise<CreationLimits | null> {
          reads += 1;
          throw new Error('firestore is down');
        },
      },
    });

    for (let i = 0; i < 5; i += 1) await controls.refusesNewRooms();
    expect(reads).toBe(1);

    clock += 1_001;
    await controls.refusesNewRooms();
    expect(reads).toBe(2);
  });

  it('keeps serving the last good value without re-reading every request', async () => {
    let reads = 0;
    let clock = 0;
    let fail = false;
    const controls = createLoadShedControls({
      now: () => clock,
      ttlMs: 1_000,
      store: {
        async getCreationLimits(): Promise<CreationLimits | null> {
          reads += 1;
          if (fail) throw new Error('firestore is down');
          return { partyPaused: true } as CreationLimits;
        },
      },
    });

    expect(await controls.refusesNewRooms()).toBe(true);
    fail = true;
    clock += 1_001;
    for (let i = 0; i < 4; i += 1) expect(await controls.refusesNewRooms()).toBe(true);
    // One retry at the expiry, then the deadline moved.
    expect(reads).toBe(2);
  });
});

describe('bandwidth rungs', () => {
  it('serves everything when the document says nothing about them', async () => {
    const controls = createLoadShedControls({ store: storeReturning({ partyPaused: true }) });
    expect(await controls.refusesVideo()).toBe(false);
    expect(await controls.servesLeanMedia()).toBe(false);
    expect(await controls.refusesAnonymous()).toBe(false);
  });

  it('reads each rung independently', async () => {
    const controls = createLoadShedControls({ store: storeReturning({ videoPaused: true }) });
    expect(await controls.refusesVideo()).toBe(true);
    expect(await controls.servesLeanMedia()).toBe(false);
    expect(await controls.refusesAnonymous()).toBe(false);
  });

  it('closes the site to visitors only when the last rung is pulled', async () => {
    const controls = createLoadShedControls({ store: storeReturning({ anonymousPaused: true }) });
    expect(await controls.refusesAnonymous()).toBe(true);
  });

  it('keeps serving when the document cannot be read', async () => {
    const controls = createLoadShedControls({
      store: {
        async getCreationLimits(): Promise<never> {
          throw new Error('firestore is unreachable');
        },
      },
    });
    expect(await controls.refusesVideo()).toBe(false);
    expect(await controls.servesLeanMedia()).toBe(false);
    expect(await controls.refusesAnonymous()).toBe(false);
  });

  it('answers several rungs from one read', async () => {
    let reads = 0;
    const controls = createLoadShedControls({
      store: storeReturning({ videoPaused: true, mediaLean: true }, () => {
        reads += 1;
      }),
    });
    await controls.refusesVideo();
    await controls.servesLeanMedia();
    await controls.refusesAnonymous();
    expect(reads).toBe(1);
  });
});

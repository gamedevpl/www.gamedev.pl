import { describe, expect, it } from 'vitest';
import { createNodeVmCage } from './cage.js';
import type { ZoneSnapshot } from './contract.js';
import { parseZoneSchema, type ZoneSchema } from './schema.js';
import { readStoredSeats, RECLAIM_GRACE_MS } from './seat-ledger.js';
import { COUNTER_SIM, TEST_SIM_MATH_JS } from './testSims.js';
import { Zone, type ZoneOutboundFrame, type ZoneSnapshotStore } from './zone.js';

// A restored world keeps actors keyed by slot; owners must follow them.

const SCHEMA = parseZoneSchema({
  tickHz: 10,
  maxPlayers: 2,
  inputs: [{ k: 'douse', type: 'none' }],
}) as ZoneSchema;

function memoryStore(): ZoneSnapshotStore & { saved: Map<string, ZoneSnapshot> } {
  const saved = new Map<string, ZoneSnapshot>();
  return {
    saved,
    load: async (id) => saved.get(id) ?? null,
    save: async (id, snapshot) => void saved.set(id, snapshot),
  };
}

function boot(store: ZoneSnapshotStore, startAt: number) {
  let clock = startAt;
  const deltas: Array<Extract<ZoneOutboundFrame, { t: 'delta' }>> = [];
  const zone = new Zone({
    id: 'ember-watch',
    slug: 'ember-watch',
    schema: SCHEMA,
    cage: createNodeVmCage(),
    source: { load: async () => ({ bundleJs: COUNTER_SIM, simMathJs: TEST_SIM_MATH_JS }) },
    store,
    broadcast: (frame) => {
      if (frame.t === 'delta') deltas.push(frame);
    },
    sendTo: () => undefined,
    now: () => clock,
    newSeed: () => 7,
  });
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) zone.pump((clock += 100));
  };
  const advance = (ms: number) => void (clock += ms);
  return { zone, deltas, tick, advance };
}

async function worldWith(tags: string[]) {
  const store = memoryStore();
  const first = boot(store, 1_000_000);
  for (const tag of tags) await first.zone.join(tag);
  first.tick(3);
  // A deploy: the zone snapshots with everyone still seated.
  await first.zone.close('host_restarting');
  return store;
}

describe('a world restored after a restart', () => {
  it('records which player owned each slot', async () => {
    const store = await worldWith(['player-a', 'player-b']);
    expect(store.saved.get('ember-watch')!.seats).toEqual([
      { slot: 0, tag: 'player-a' },
      { slot: 1, tag: 'player-b' },
    ]);
  });

  it('never seats a stranger in a slot another player still owns', async () => {
    const store = await worldWith(['player-a']);
    const next = boot(store, 1_000_400);
    expect(await next.zone.join('player-c')).toBe(1);
    expect(await next.zone.join('player-a')).toBe(0);
  });

  it('gives a returning player their own slot whatever order people reconnect in', async () => {
    const store = await worldWith(['player-a', 'player-b']);
    const next = boot(store, 1_000_400);
    expect(await next.zone.join('player-b')).toBe(1);
    expect(await next.zone.join('player-a')).toBe(0);
    next.tick();
    expect(next.deltas[0].ev.filter((event) => event.k === 'leave')).toEqual([]);
  });

  it('retires an absent owner before a newcomer takes the last slot', async () => {
    const store = await worldWith(['player-a', 'player-b']);
    const next = boot(store, 1_000_400);
    expect(await next.zone.join('player-b')).toBe(1);
    expect(await next.zone.join('player-c')).toBe(0);
    next.tick();
    expect(next.deltas[0].ev).toEqual([
      { slot: 1, k: 'join' },
      { slot: 0, k: 'leave' },
      { slot: 0, k: 'join' },
    ]);
  });

  it('retires an actor whose owner does not come back in time', async () => {
    const store = await worldWith(['player-a', 'player-b']);
    const next = boot(store, 1_000_400);
    await next.zone.join('player-b');
    next.advance(RECLAIM_GRACE_MS);
    next.tick();
    expect(next.deltas.flatMap((delta) => delta.ev)).toContainEqual({ slot: 0, k: 'leave' });
    // Gone for good: the owner now arrives like anyone else.
    expect(await next.zone.join('player-a')).toBe(0);
    next.tick();
    expect(next.deltas.at(-1)!.ev).toEqual([{ slot: 0, k: 'join' }]);
  });

  it('retires every actor of a snapshot that names no owners', async () => {
    const store = await worldWith(['player-a']);
    delete store.saved.get('ember-watch')!.seats;
    const next = boot(store, 1_000_400);
    expect(await next.zone.join('player-c')).toBe(0);
    next.tick();
    expect(next.deltas[0].ev).toEqual([
      { slot: 0, k: 'leave' },
      { slot: 1, k: 'leave' },
      { slot: 0, k: 'join' },
    ]);
  });
});

describe('readStoredSeats', () => {
  it('accepts a well-formed owner list', () => {
    expect(readStoredSeats([{ slot: 0, tag: 'a' }])).toEqual([{ slot: 0, tag: 'a' }]);
  });

  it('reads anything malformed as no owners', () => {
    expect(readStoredSeats(undefined)).toBeUndefined();
    expect(readStoredSeats([{ slot: '0', tag: 'a' }])).toBeUndefined();
    expect(readStoredSeats([{ slot: -1, tag: 'a' }])).toBeUndefined();
    expect(readStoredSeats([null])).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeVmCage, type SimCage, type SimInstance } from './cage.js';
import { ZONE_SNAPSHOT_VERSION, type ZoneSnapshot } from './contract.js';
import { parseZoneSchema, type ZoneSchema } from './schema.js';
import {
  PARK_GRACE_MS,
  Zone,
  ZoneFullError,
  type SimSource,
  type ZoneOutboundFrame,
  type ZoneSnapshotStore,
  type ZoneWarnEvent,
} from './zone.js';
import {
  BLOATED_SIM,
  COUNTER_SIM,
  MODULE_STATE_SIM,
  SLOW_SIM,
  TEST_SIM_MATH_JS,
  THROWING_SIM,
  UNSTORABLE_SIM,
} from './testSims.js';

/**
 * The zone lifecycle: a world that runs while people are in it, sleeps when they leave,
 * and comes back where it stopped.
 *
 * The clock is injected throughout. A test that waited for real ticks would be slow and
 * flaky, and — more to the point — the interesting properties here are all about *time
 * the zone did not spend running*, which is not something you can wait for.
 */

const SCHEMA = parseZoneSchema({
  tickHz: 10,
  maxPlayers: 2,
  inputs: [
    { k: 'move', type: 'enum', values: ['n', 's'] },
    { k: 'douse', type: 'none' },
  ],
}) as ZoneSchema;

class FakeStore implements ZoneSnapshotStore {
  saved = new Map<string, ZoneSnapshot>();
  writes = 0;
  failNext = false;

  async load(zoneId: string) {
    return this.saved.get(zoneId) ?? null;
  }

  async save(zoneId: string, snapshot: ZoneSnapshot) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('firestore is having a moment');
    }
    this.writes += 1;
    this.saved.set(zoneId, snapshot);
  }
}

function simSource(bundleJs: string | null): SimSource {
  return { load: async () => (bundleJs ? { bundleJs, simMathJs: TEST_SIM_MATH_JS } : null) };
}

interface Harness {
  zone: Zone;
  store: FakeStore;
  broadcasts: ZoneOutboundFrame[];
  direct: Array<{ slot: number; frame: ZoneOutboundFrame }>;
  setNow(at: number): void;
  /** Runs `count` whole ticks by advancing the clock and pumping. */
  runTicks(count: number): void;
}

function harness(options: { sim?: string; store?: FakeStore; schema?: ZoneSchema; startAt?: number } = {}): Harness {
  const store = options.store ?? new FakeStore();
  const broadcasts: ZoneOutboundFrame[] = [];
  const direct: Array<{ slot: number; frame: ZoneOutboundFrame }> = [];
  let clock = options.startAt ?? 1_000_000;

  const zone = new Zone({
    id: 'ember-watch',
    slug: 'ember-watch',
    schema: options.schema ?? SCHEMA,
    cage: createNodeVmCage(),
    source: simSource(options.sim ?? COUNTER_SIM),
    store,
    broadcast: (frame) => broadcasts.push(frame),
    sendTo: (slot, frame) => direct.push({ slot, frame }),
    now: () => clock,
    newSeed: () => 4242,
  });

  return {
    zone,
    store,
    broadcasts,
    direct,
    setNow: (at) => {
      clock = at;
    },
    runTicks: (count) => {
      for (let index = 0; index < count; index++) {
        clock += 100;
        zone.pump(clock);
      }
    },
  };
}

describe('a live zone', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('wakes on the first arrival and hands them the world', async () => {
    expect(h.zone.state).toBe('sleeping');
    const slot = await h.zone.join('player-a');

    expect(slot).toBe(0);
    expect(h.zone.state).toBe('live');
    // The snapshot is a separate step, because the caller has to have finished seating
    // the connection before a frame aimed at that seat can reach it.
    h.zone.snapshotTo(slot);
    const snap = h.direct.find((sent) => sent.frame.t === 'snap');
    expect(snap).toMatchObject({ slot: 0, frame: { t: 'snap', tick: 0, seed: 4242 } });
  });

  it('tells the sim about an arrival through the ordered event stream', async () => {
    // Not through a side channel: a join that could be applied out of order relative to
    // the inputs around it is a player who acts before they exist.
    await h.zone.join('player-a');
    h.runTicks(1);

    const delta = h.broadcasts.find((frame) => frame.t === 'delta');
    expect(delta).toMatchObject({ tick: 1, ev: [{ slot: 0, k: 'join' }] });
  });

  it('advances one tick per tick period and no faster', async () => {
    await h.zone.join('player-a');
    h.runTicks(10);
    expect(h.zone.currentTick).toBe(10);
  });

  it('attaches the slot to an input rather than believing the client', async () => {
    const slot = await h.zone.join('player-a');
    expect(h.zone.enqueue(slot, 'move', 'n')).toBe(true);
    h.runTicks(1);

    const delta = h.broadcasts.find((frame) => frame.t === 'delta' && frame.ev.some((e) => e.k === 'move'));
    expect(delta).toMatchObject({ ev: expect.arrayContaining([{ slot: 0, k: 'move', v: 'n' }]) });
  });

  it('refuses everything outside the declared vocabulary', async () => {
    const slot = await h.zone.join('player-a');
    // The shell checks these too. That is not redundancy: a modified client does not run
    // the shell's copy, so this is the check that counts.
    expect(h.zone.enqueue(slot, 'teleport', undefined)).toBe(false);
    expect(h.zone.enqueue(slot, 'move', 'e')).toBe(false);
    expect(h.zone.enqueue(slot, 'douse', 1)).toBe(false);
    expect(h.zone.enqueue(slot, 'join', undefined)).toBe(false);
    expect(h.zone.enqueue(slot, 'leave', undefined)).toBe(false);
  });

  it('ignores input from a seat nobody is sitting in', async () => {
    await h.zone.join('player-a');
    expect(h.zone.enqueue(5, 'douse', undefined)).toBe(false);
  });

  it('bounds how much one player may queue for a single tick', async () => {
    const slot = await h.zone.join('player-a');
    const accepted = Array.from({ length: 20 }, () => h.zone.enqueue(slot, 'douse', undefined)).filter(Boolean);
    // A tick's events are a handful of intents, not a queue to flush.
    expect(accepted.length).toBeLessThanOrEqual(8);
  });

  it('carries a checksum once a second, not on every delta', async () => {
    await h.zone.join('player-a');
    h.runTicks(20);

    const deltas = h.broadcasts.filter((frame) => frame.t === 'delta');
    const checked = deltas.filter((frame) => frame.t === 'delta' && frame.h !== undefined);
    expect(deltas).toHaveLength(20);
    expect(checked).toHaveLength(2);
    expect(checked[0]).toMatchObject({ h: expect.stringMatching(/^[a-f0-9]{16}$/) });
  });

  it('seats a second player and refuses a third', async () => {
    await h.zone.join('player-a');
    await h.zone.join('player-b');
    await expect(h.zone.join('player-c')).rejects.toThrow(ZoneFullError);
  });

  it('gives a returning player the seat they left, not the lowest free one', async () => {
    // Which is what makes closing a tab and coming back put a character where it was
    // standing instead of spawning a stranger beside it.
    await h.zone.join('player-a');
    const bSlot = await h.zone.join('player-b');
    h.zone.leave(0);

    expect(await h.zone.join('player-b')).toBe(bSlot);
  });

  it('does not run ten ticks at once after the host was blocked', async () => {
    await h.zone.join('player-a');
    // A second of fire spread applied in one frame is a world every client has to
    // rewind through. Falling behind is caught up to a point and then forgiven.
    h.zone.pump(1_000_000 + 60_000);
    expect(h.zone.currentTick).toBeLessThanOrEqual(8);
  });
});

describe('hibernation', () => {
  it('stops ticking the moment the last player leaves, and writes the world out', async () => {
    const h = harness();
    await h.zone.join('player-a');
    h.runTicks(5);
    h.zone.leave(0);
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Not "ticks more slowly" — stops. This is the step the whole cost model rests on:
    // no sockets, no zone, no instance.
    expect(h.zone.state).toBe('parked');
    expect(h.store.saved.has('ember-watch')).toBe(true);
    const before = h.zone.currentTick;
    const writes = h.store.writes;
    h.runTicks(10);
    expect(h.zone.currentTick).toBe(before);
    expect(h.store.writes).toBe(writes);
  });

  it('forgets the world once the grace has passed, without a second write', async () => {
    const h = harness();
    await h.zone.join('player-a');
    h.runTicks(5);
    h.zone.leave(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const writes = h.store.writes;

    h.setNow(1_000_500 + PARK_GRACE_MS - 1);
    h.zone.pump();
    expect(h.zone.state).toBe('parked');

    h.setNow(1_000_500 + PARK_GRACE_MS);
    h.zone.pump();
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Nothing ticked while parked; the park-time snapshot is still the world.
    expect(h.zone.state).toBe('sleeping');
    expect(h.store.writes).toBe(writes);
  });

  it('is parked the instant the last player leaves, not after the write lands', async () => {
    // A zone still live through the write would tick empty and park under a rejoin.
    const store = new FakeStore();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalSave = store.save.bind(store);
    store.save = async (zoneId, snapshot) => {
      await gate;
      return originalSave(zoneId, snapshot);
    };
    const h = harness({ store });
    await h.zone.join('player-a');
    h.runTicks(5);
    const tickAtLeave = h.zone.currentTick;
    h.zone.leave(0);

    expect(h.zone.state).toBe('parked');
    h.runTicks(3);
    expect(h.zone.currentTick).toBe(tickAtLeave);

    await h.zone.join('player-a');
    expect(h.zone.state).toBe('live');
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The write landing later must not park an occupied world.
    expect(h.zone.state).toBe('live');
    h.runTicks(2);
    expect(h.zone.currentTick).toBe(tickAtLeave + 2);
    expect(store.saved.get('ember-watch')!.tick).toBe(tickAtLeave);
  });

  it('lets a player back inside the grace without reloading anything', async () => {
    let loads = 0;
    const store = new FakeStore();
    const originalLoad = store.load.bind(store);
    store.load = async (zoneId) => {
      loads += 1;
      return originalLoad(zoneId);
    };
    const h = harness({ store });
    await h.zone.join('player-a');
    h.runTicks(5);
    h.zone.leave(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(loads).toBe(1);

    // Screen locked, tab backgrounded: the socket comes back seconds later.
    h.setNow(1_000_500 + 5_000);
    await h.zone.join('player-a');
    expect(h.zone.state).toBe('live');
    // No Firestore read, and the five seconds were caught up as a cold wake would.
    expect(loads).toBe(1);
    await h.zone.hibernate('empty');
    expect(JSON.parse(store.saved.get('ember-watch')!.state).slept).toBe(50);
  });

  it('resumes on the exact generator position it left', async () => {
    // The property everything else about waking is in service of. A zone that slept
    // through the middle of a run must land where one that never slept did — if the
    // stream is a single draw out of step, the worlds diverge on the next tick.
    const uninterrupted = harness();
    await uninterrupted.zone.join('player-a');
    uninterrupted.runTicks(20);
    await uninterrupted.zone.hibernate('empty');
    const expected = uninterrupted.store.saved.get('ember-watch')!;

    const store = new FakeStore();
    const first = harness({ store });
    await first.zone.join('player-a');
    first.runTicks(12);
    first.zone.leave(0);
    await new Promise((resolve) => setTimeout(resolve, 5));

    // A fresh zone object, as a woken zone always is — new realm, new process in
    // production. Same clock, so no time passed and `wake` has nothing to catch up on.
    const second = harness({ store, startAt: 1_000_000 + 12 * 100 });
    await second.zone.join('player-a');
    second.runTicks(8);
    await second.zone.hibernate('empty');

    const resumed = second.store.saved.get('ember-watch')!;
    expect(resumed.tick).toBe(expected.tick);
    expect(resumed.draws).toBe(expected.draws);
    expect(JSON.parse(resumed.state).sum).toBeCloseTo(JSON.parse(expected.state).sum, 12);
  });

  it('catches the world up on the time it slept through', async () => {
    const store = new FakeStore();
    const first = harness({ store });
    await first.zone.join('player-a');
    first.runTicks(3);
    await first.zone.hibernate('empty');
    const sleptAt = store.saved.get('ember-watch')!.tick;

    // Ten seconds later. The fire does not politely pause because the last watcher
    // logged off — how much of that applies is the game's decision, and the platform
    // hands over real milliseconds rather than deciding for it.
    const second = harness({ store, startAt: 1_000_000 + 10_000 });
    await second.zone.join('player-a');

    second.zone.snapshotTo(0);
    const snap = second.direct.find((sent) => sent.frame.t === 'snap')!.frame as { tick: number };
    expect(snap.tick).toBe(sleptAt);
    const state = JSON.parse(second.store.saved.get('ember-watch')!.state) as { slept: number };
    await second.zone.hibernate('empty');
    expect(JSON.parse(second.store.saved.get('ember-watch')!.state).slept).toBeGreaterThan(0);
    void state;
  });

  it('opens on the last snapshot when wake catch-up times out, rather than refusing the join', async () => {
    // A6 2026-08-02: cold gamedev-world + biplane-skirmish wake blew the isolate budget
    // and the shell fell back to silent solo play. Surviving on the snapshot is the
    // lesser wrong — the world is a few minutes behind, not a different mode of play.
    const store = new FakeStore();
    const first = harness({ store });
    await first.zone.join('player-a');
    first.runTicks(3);
    await first.zone.hibernate('empty');
    const slept = store.saved.get('ember-watch')!;

    const warnings: ZoneWarnEvent[] = [];
    let wakeCalls = 0;
    const inner = createNodeVmCage();
    const cage: SimCage = {
      kind: 'node-vm',
      preemptsRunawayTick: false,
      async load(options) {
        const instance = await inner.load(options);
        const wrapped: SimInstance = {
          init: (seed) => instance.init(seed),
          restore: (seed, state, draws) => instance.restore(seed, state, draws),
          tick: (events) => instance.tick(events),
          wake: (elapsedMs) => {
            wakeCalls += 1;
            if (wakeCalls === 1) throw new Error('Script execution timed out.');
            instance.wake(elapsedMs);
          },
          snapshot: () => instance.snapshot(),
          dispose: () => instance.dispose(),
        };
        return wrapped;
      },
      dispose: () => inner.dispose(),
    };

    const zone = new Zone({
      id: 'ember-watch',
      slug: 'ember-watch',
      schema: SCHEMA,
      cage,
      source: simSource(COUNTER_SIM),
      store,
      broadcast: () => undefined,
      sendTo: () => undefined,
      now: () => slept.savedAt + 60_000,
      newSeed: () => 4242,
      onWarn: (event) => warnings.push(event),
    });

    await expect(zone.join('player-a')).resolves.toBe(0);
    expect(zone.state).toBe('live');
    expect(wakeCalls).toBe(1);
    expect(warnings).toEqual([
      expect.objectContaining({
        kind: 'wake_catchup_skipped',
        slug: 'ember-watch',
        zoneId: 'ember-watch',
        elapsedMs: 60_000,
      }),
    ]);
  });

  it('gives coming up its own budget rather than pricing it as a tick', async () => {
    // The wiring half of A6 2026-08-05/06. `cage.test.ts` proves a cage honours a separate
    // startup budget; this proves the zone actually asks for one, which is the part that
    // was missing — the cage was always willing to be told.
    let seen: { timeoutMs: number; startupTimeoutMs?: number } | null = null;
    const inner = createNodeVmCage();
    const cage: SimCage = {
      kind: 'node-vm',
      preemptsRunawayTick: false,
      async load(options) {
        seen = { timeoutMs: options.timeoutMs, startupTimeoutMs: options.startupTimeoutMs };
        return inner.load(options);
      },
      dispose: () => inner.dispose(),
    };

    const zone = new Zone({
      id: 'ember-watch',
      slug: 'ember-watch',
      schema: SCHEMA,
      cage,
      source: simSource(COUNTER_SIM),
      store: new FakeStore(),
      broadcast: () => undefined,
      sendTo: () => undefined,
      now: () => 1_000_000,
      newSeed: () => 4242,
    });

    await zone.join('player-a');
    expect(seen).not.toBeNull();
    expect(seen!.startupTimeoutMs).toBeGreaterThan(seen!.timeoutMs);
    // Not an arbitrary floor: every one of these failures was an isolate losing a race
    // against a couple of hundred milliseconds, so a budget in that neighbourhood is no
    // fix at all.
    expect(seen!.startupTimeoutMs).toBeGreaterThanOrEqual(1_000);
  });

  it('loses what a sim kept outside its state, which is why the gate checks for it', async () => {
    // Perfectly reproducible run to run, and gone the moment a zone sleeps. Check 23
    // catches this in CI; this is what it would have cost in production.
    const store = new FakeStore();
    const first = harness({ store, sim: MODULE_STATE_SIM });
    await first.zone.join('player-a');
    first.runTicks(5);
    await first.zone.hibernate('empty');
    expect(JSON.parse(store.saved.get('ember-watch')!.state).hidden).toBe(5);

    const second = harness({ store, sim: MODULE_STATE_SIM, startAt: 1_000_000 + 500 });
    await second.zone.join('player-a');
    second.runTicks(1);
    await second.zone.hibernate('empty');
    // Restarted from zero rather than continuing from five.
    expect(JSON.parse(store.saved.get('ember-watch')!.state).hidden).toBe(1);
  });

  it('snapshots periodically while people are playing', async () => {
    const h = harness();
    await h.zone.join('player-a');
    h.runTicks(400);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Which is also the loss bound if the instance dies without warning: an unscheduled
    // hibernate costs the time since the last successful write.
    expect(h.store.writes).toBeGreaterThanOrEqual(1);
  });

  it('keeps playing when a snapshot write fails', async () => {
    const h = harness();
    await h.zone.join('player-a');
    h.store.failNext = true;
    h.runTicks(400);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(h.zone.state).toBe('live');
    h.runTicks(5);
    expect(h.zone.currentTick).toBeGreaterThan(400);
  });

  it('starts a fresh world when the stored snapshot is from a schema it does not know', async () => {
    const store = new FakeStore();
    store.saved.set('ember-watch', {
      version: ZONE_SNAPSHOT_VERSION + 1,
      seed: 1,
      tick: 900,
      draws: 900,
      state: '{"t":900}',
      savedAt: 1_000_000,
    });
    const h = harness({ store });
    await h.zone.join('player-a');
    // A shape this host did not write must never reach a sim that has moved on — the
    // same call P1 made for a stale save. A clean start cannot crash a world.
    expect(h.zone.currentTick).toBe(0);
  });
});

describe('runtime budgets', () => {
  it('stops a zone whose ticks keep running long', async () => {
    // Check 23 proves a sim *can* tick in 8 ms on a build machine. This is what happens
    // when it does not on a real one, with fifteen other zones on the same core.
    const h = harness({ sim: SLOW_SIM });
    await h.zone.join('player-a');
    h.runTicks(200);

    expect(h.zone.state).toBe('sleeping');
    expect(h.zone.lastFailure).toMatch(/tick budget/);
    expect(h.broadcasts.some((frame) => frame.t === 'closed' && frame.reason === 'zone_stopped')).toBe(true);
  }, 60_000);

  it('forgives an occasional slow tick', async () => {
    const h = harness();
    await h.zone.join('player-a');
    h.runTicks(200);
    // One slow tick is a garbage collection or a noisy neighbour; killing a world for it
    // would be its own outage.
    expect(h.zone.state).toBe('live');
  });

  it('stops a zone that outgrows the snapshot ceiling', async () => {
    // Not tidiness: a state past the ceiling cannot be written to Firestore at all, so a
    // zone that crossed it would run happily until it tried to sleep and then lose
    // everything.
    const h = harness({ sim: BLOATED_SIM });
    await h.zone.join('player-a');
    h.runTicks(200);

    expect(h.zone.state).toBe('sleeping');
    expect(h.zone.lastFailure).toMatch(/snapshot ceiling/);
  }, 60_000);

  it('stops a zone whose state JSON could not carry back', async () => {
    const h = harness({ sim: UNSTORABLE_SIM });
    await h.zone.join('player-a');
    h.runTicks(400);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(h.zone.state).toBe('sleeping');
    expect(h.zone.lastFailure).toMatch(/cannot be snapshotted/);
    // The last good snapshot is what stands. Writing the broken one would produce a
    // world that silently changes shape the first time this zone woke up.
    expect(h.store.saved.has('ember-watch')).toBe(false);
  });

  it('stops a zone whose sim throws rather than broadcasting a half-applied world', async () => {
    const h = harness({ sim: THROWING_SIM });
    await h.zone.join('player-a');
    h.runTicks(10);

    expect(h.zone.state).toBe('sleeping');
    expect(h.zone.lastFailure).toMatch(/threw during tick/);
  });
});

describe('a game with no simulation', () => {
  it('cannot open a zone', async () => {
    const store = new FakeStore();
    const zone = new Zone({
      id: 'lantern-depths',
      slug: 'lantern-depths',
      schema: SCHEMA,
      cage: createNodeVmCage(),
      source: simSource(null),
      store,
      broadcast: () => undefined,
      sendTo: () => undefined,
      now: () => 1,
    });
    await expect(zone.join('player-a')).rejects.toThrow(/no simulation is published/);
    // And the seat is not left claimed by a player who never got in.
    expect(zone.playerCount).toBe(0);
  });
});

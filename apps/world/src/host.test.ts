import { describe, expect, it } from 'vitest';
import {
  createNodeVmCage,
  mintZoneTicket,
  parseZoneSchema,
  ZONE_TICKET_TTL_MS,
  type SimSource,
  type ZoneSchema,
  type ZoneSnapshot,
  type ZoneSnapshotStore,
} from '@gamedevpl/zone-core';
import { ZoneAdmissionError, ZoneHost, type ZoneConnection } from './host.js';

/**
 * The host's own bookkeeping, which `app.test.ts` cannot reach through a socket.
 *
 * Specifically the interval between "a zone was created for you" and "you have a seat in
 * it". A joining player is invisible for the whole of it — the zone is not live yet
 * because the sim is still being fetched, and nobody is seated because seating is what
 * the join is for — so every reaping rule in this class has to be written to leave that
 * window alone. The sweep's was not, and it ran every 20 ms against a window hundreds of
 * milliseconds wide.
 */

const SECRET = 'dev-session-secret-change-me';

const SCHEMA = parseZoneSchema({
  tickHz: 10,
  maxPlayers: 3,
  inputs: [{ k: 'douse', type: 'none' }],
}) as ZoneSchema;

const SIM = `var __SIM_BUNDLE__ = (function () {
  function init(seed) { return { t: 0, seed: seed }; }
  function tick(state) { state.t++; return state; }
  function wake(state) { return state; }
  return { init: init, tick: tick, wake: wake };
})();`;

const SIM_MATH = `globalThis.__SIM_MATH__ = (function () {
  var shim = {};
  Object.getOwnPropertyNames(Math).forEach(function (name) { shim[name] = Math[name]; });
  return shim;
})();`;

function memoryStore(): ZoneSnapshotStore {
  const saved = new Map<string, ZoneSnapshot>();
  return {
    load: async (id) => saved.get(id) ?? null,
    save: async (id, snapshot) => void saved.set(id, snapshot),
  };
}

/** A source that fails the way the network does: after the join has already begun. */
function failingSource(error: Error): SimSource {
  return {
    load: async () => {
      throw error;
    },
  };
}

/** A source that holds the sim back until released, which is what the network does. */
function pausedSource(): { source: SimSource; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release(),
    source: {
      load: async () => {
        await gate;
        return { bundleJs: SIM, simMathJs: SIM_MATH };
      },
    },
  };
}

function ticketFor(player: string): string {
  return mintZoneTicket(
    { zone: 'ember-watch', slug: 'ember-watch', player, expiresAt: Date.now() + ZONE_TICKET_TTL_MS },
    SECRET,
  );
}

function silentConnection(): ZoneConnection {
  return { send: () => {}, close: () => {} };
}

function makeHost(source: SimSource, options: { now?: () => number; idleMs?: number } = {}): ZoneHost {
  return new ZoneHost({
    cage: createNodeVmCage(),
    source,
    store: memoryStore(),
    schemas: { getSchema: async (slug) => (slug === 'ember-watch' ? SCHEMA : null) },
    secret: SECRET,
    now: options.now,
    idleMs: options.idleMs,
  });
}

// The ordinary case: a sim that loads.
function workingSource(): SimSource {
  return { load: async () => ({ bundleJs: SIM, simMathJs: SIM_MATH }) };
}

// Remembers what it was told, which is the whole assertion for a reap.
function recordingConnection(): ZoneConnection & { closedWith: string | null; frames: unknown[] } {
  const record = {
    closedWith: null as string | null,
    frames: [] as unknown[],
    send(frame: unknown) {
      record.frames.push(frame);
    },
    close(reason: string) {
      record.closedWith = reason;
    },
  };
  return record;
}

describe('ZoneHost admission', () => {
  it('does not let the sweep reap a zone somebody is still joining', async () => {
    // The bug this pins took the whole feature down in production while looking like a
    // deployment problem: the sweep deleted the zone and its seat set during the await,
    // and every single join — the first one on a cold instance included — came back
    // `zone_unavailable`. It reproduces without any timing luck, because the sweep is
    // driven by hand here.
    const { source, release } = pausedSource();
    const host = makeHost(source);
    const ticket = ticketFor('p1');

    const admission = host.admit(ticket, silentConnection());
    await Promise.resolve();
    host.pump(Date.now());
    host.pump(Date.now());
    release();

    const seated = await admission;
    expect(seated.slot).toBe(0);
    expect(seated.zoneId).toBe('ember-watch');
    // The seat alone does not prove it. A reaped zone still hands back a slot — the Zone
    // object survives in the closure — but the host no longer holds it, so nothing pumps
    // it and the next arrival builds a second world with the same name. This is the
    // assertion that fails without the guard.
    expect(host.liveZoneCount).toBe(1);
    host.shutdown?.();
  });

  it('still reaps a zone once the last joiner has gone', async () => {
    // The guard is scoped to admissions in flight, not a licence to keep empty zones —
    // min-instances 0 is only honest if an empty world stops existing.
    const { source, release } = pausedSource();
    const host = makeHost(source);
    release();
    const ticket = ticketFor('p1');
    const connection = silentConnection();
    const seated = await host.admit(ticket, connection);

    host.release('ember-watch', seated.slot, connection);
    // Hibernation writes the final snapshot before it drops the sim, so the zone is still
    // live for a microtask after the last seat goes.
    await new Promise((resolve) => setImmediate(resolve));
    host.pump(Date.now());
    expect(host.liveZoneCount).toBe(0);
    host.shutdown?.();
  });

  it('gives a second player joining the same zone the same world, not a second one', async () => {
    // Two Zone objects for one id would be two sims of one world inside the process that
    // max-instances 1 exists to keep singular, so the reaping guard has to hold across
    // overlapping admissions as well as a single one.
    const { source, release } = pausedSource();
    const host = makeHost(source);
    const first = host.admit(ticketFor('p1'), silentConnection());
    const second = host.admit(ticketFor('p2'), silentConnection());
    await Promise.resolve();
    host.pump(Date.now());
    release();

    const [a, b] = await Promise.all([first, second]);
    expect(a.zone).toBe(b.zone);
    expect(new Set([a.slot, b.slot]).size).toBe(2);

    // And a player arriving afterwards joins that same world rather than a fresh one,
    // which is what a reap between the two would have produced.
    const later = await host.admit(ticketFor('p3'), silentConnection());
    expect(later.zone).toBe(a.zone);
    expect(host.liveZoneCount).toBe(1);
    host.shutdown?.();
  });
});

describe('a refused admission', () => {
  it('carries what actually failed, not just the word for it', async () => {
    // The wire reason is one of a handful of fixed strings and is meant to be incurious,
    // so the operator's only supply of truth is the cause. It used to be dropped at the
    // wrap: the first `zone_unavailable` the alerting ever caught arrived with a stack
    // beginning inside `admit` and a message that was the wire reason repeated, which is
    // the exact blindness the log line was added to end. An alert that fires without a
    // cause is a doorbell.
    const boom = new Error('games repo said no');
    const host = makeHost(failingSource(boom));

    await expect(host.admit(ticketFor('p1'), silentConnection())).rejects.toThrow(ZoneAdmissionError);

    const error = await host.admit(ticketFor('p2'), silentConnection()).catch((caught) => caught);
    expect(error).toBeInstanceOf(ZoneAdmissionError);
    expect((error as ZoneAdmissionError).reason).toBe('zone_unavailable');
    expect((error as ZoneAdmissionError).cause).toBe(boom);

    host.shutdown?.();
  });

  it('names the game and the world, which the cause alone could not', async () => {
    // A6 2026-08-05 logged a bundle that timed out loading and gave no way to find out
    // whose bundle it was: the cause is a stack inside the cage, and the cage does not
    // know what it is running. The slug comes off the verified ticket instead. Note what
    // is deliberately absent — `claims.player` — since the host being unable to identify
    // a person is the property that lets it run untrusted code at all.
    const host = makeHost(failingSource(new Error('games repo said no')));

    const error = await host.admit(ticketFor('p1'), silentConnection()).catch((caught) => caught);
    expect(error).toBeInstanceOf(ZoneAdmissionError);
    expect((error as ZoneAdmissionError).slug).toBe('ember-watch');
    expect((error as ZoneAdmissionError).zoneId).toBe('ember-watch');
    expect(JSON.stringify(error)).not.toContain('p1');

    host.shutdown?.();
  });
});

describe('a seat that stopped playing', () => {
  // An open socket is not a player. See docs/p3-zone-protocol.md §7.
  const IDLE_MS = 60_000;

  function clockAt(start: number): { now: () => number; set(at: number): void } {
    let at = start;
    return { now: () => at, set: (next) => void (at = next) };
  }

  it('hangs up, retires the chair, and lets the world sleep', async () => {
    const clock = clockAt(5_000_000);
    const host = makeHost(workingSource(), { now: clock.now, idleMs: IDLE_MS });
    const connection = recordingConnection();

    const seated = await host.admit(ticketFor('p1'), connection);
    expect(host.liveZoneCount).toBe(1);

    // Still inside the budget: a player between two deliberate moves is playing.
    clock.set(5_000_000 + IDLE_MS - 1);
    host.pump(clock.now());
    expect(connection.closedWith).toBe(null);
    expect(seated.zone.playerCount).toBe(1);

    clock.set(5_000_000 + IDLE_MS);
    host.pump(clock.now());

    // `idle`, a reason the shell treats as final, so it does not redial.
    expect(connection.closedWith).toBe('idle');
    expect(seated.zone.playerCount).toBe(0);

    // The point of all of it: "empty" now counts a player who walked away.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seated.zone.state).toBe('sleeping');

    await host.shutdown();
  });

  it('leaves a player who is still sending alone', async () => {
    const clock = clockAt(5_000_000);
    const host = makeHost(workingSource(), { now: clock.now, idleMs: IDLE_MS });
    const quiet = recordingConnection();
    const playing = recordingConnection();

    await host.admit(ticketFor('p1'), quiet);
    const second = await host.admit(ticketFor('p2'), playing);

    clock.set(5_000_000 + IDLE_MS - 1);
    host.input('ember-watch', second.slot, 'douse', undefined);

    clock.set(5_000_000 + IDLE_MS);
    host.pump(clock.now());

    expect(quiet.closedWith).toBe('idle');
    expect(playing.closedWith).toBe(null);
    expect(second.zone.playerCount).toBe(1);

    await host.shutdown();
  });

  it('gives the freed seat to the next arrival', async () => {
    const clock = clockAt(5_000_000);
    const host = makeHost(workingSource(), { now: clock.now, idleMs: IDLE_MS });

    const first = await host.admit(ticketFor('p1'), recordingConnection());
    expect(first.slot).toBe(0);

    clock.set(5_000_000 + IDLE_MS);
    host.pump(clock.now());

    // The seat itself, back in the pool: a socket-only reap would hand out slot 1.
    const next = await host.admit(ticketFor('p2'), recordingConnection());
    expect(next.slot).toBe(0);

    await host.shutdown();
  });
});

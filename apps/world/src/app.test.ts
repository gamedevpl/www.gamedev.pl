import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
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
import { buildWorldApp, type WorldApp } from './app.js';

/**
 * The world service end to end, over a real websocket.
 *
 * The zone lifecycle is tested against fakes in `@gamedevpl/zone-core`; what is left for
 * here is the boundary — that a forged ticket gets nowhere, that a client cannot name its
 * own slot or conjure a player, and that the frames a real socket receives are the ones
 * the protocol document promises. A test that stubbed the socket would prove none of it.
 */

const SECRET = 'dev-session-secret-change-me';

const SCHEMA = parseZoneSchema({
  tickHz: 10,
  maxPlayers: 2,
  inputs: [
    { k: 'move', type: 'enum', values: ['n', 's'] },
    { k: 'douse', type: 'none' },
  ],
}) as ZoneSchema;

const SIM = `var __SIM_BUNDLE__ = (function () {
  function init(seed, rng) { return { t: 0, seed: seed, r: rng(), players: [], acts: 0 }; }
  function tick(state, events, rng) {
    state.t++;
    for (var i = 0; i < events.length; i++) {
      if (events[i].k === 'join') state.players.push(events[i].slot);
      else if (events[i].k !== 'leave') state.acts++;
    }
    state.r = rng();
    return state;
  }
  function wake(state) { return state; }
  return { init: init, tick: tick, wake: wake };
})();`;

/**
 * Stands in for the games repo's `shared/sim-math.ts`.
 *
 * Copied property by property rather than with `Object.assign({}, Math)`, which looks
 * equivalent and produces an empty object: every property of `Math` is non-enumerable,
 * so the spread copies nothing. The realm would then have a `Math` with no `imul`, and
 * the first thing to fail would be the seeded generator in the bootstrap — a long way
 * from the line that caused it.
 */
const SIM_MATH = `globalThis.__SIM_MATH__ = (function () {
  var shim = {};
  Object.getOwnPropertyNames(Math).forEach(function (name) { shim[name] = Math[name]; });
  shim.random = function () { throw new Error('use the rng passed into tick'); };
  return shim;
})();`;

const source: SimSource = {
  load: async (slug) => (slug === 'ember-watch' ? { bundleJs: SIM, simMathJs: SIM_MATH } : null),
};

function memoryStore(): ZoneSnapshotStore {
  const saved = new Map<string, ZoneSnapshot>();
  return {
    load: async (id) => saved.get(id) ?? null,
    save: async (id, snapshot) => void saved.set(id, snapshot),
  };
}

function ticketFor(player: string, zone = 'ember-watch', slug = 'ember-watch') {
  return mintZoneTicket({ zone, slug, player, expiresAt: Date.now() + ZONE_TICKET_TTL_MS }, SECRET);
}

let running: WorldApp | null = null;
let sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets) socket.close();
  sockets = [];
  if (running) await running.app.close();
  running = null;
});

async function startHost(options: { schemas?: Record<string, ZoneSchema> } = {}) {
  const schemas = options.schemas ?? { 'ember-watch': SCHEMA };
  const built = await buildWorldApp({
    cage: createNodeVmCage(),
    source,
    store: memoryStore(),
    schemas: { getSchema: async (slug) => schemas[slug] ?? null },
    secret: SECRET,
  });
  running = built;
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { ...built, url: `ws://127.0.0.1:${port}/zone/ws` };
}

/** Opens a socket and collects every frame it receives. */
function connect(url: string) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: Array<Record<string, unknown>> = [];
  socket.on('message', (data: Buffer) => {
    frames.push(JSON.parse(data.toString('utf8')) as Record<string, unknown>);
  });
  const open = new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return {
    socket,
    frames,
    open,
    send: (frame: Record<string, unknown>) => socket.send(JSON.stringify({ v: 1, ...frame })),
  };
}

async function waitFor<T>(check: () => T | undefined, attempts = 120): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = check();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for a frame');
}

describe('the world service', () => {
  it('answers a health probe without opening anything', async () => {
    const { app } = await startHost();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, zones: 0 });
  });

  it('seats a player holding a valid ticket and hands them the world', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });

    const welcome = await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));
    expect(welcome).toMatchObject({ v: 1, slot: 0, zone: 'ember-watch', slug: 'ember-watch', tickHz: 10 });

    const snap = await waitFor(() => client.frames.find((frame) => frame.t === 'snap'));
    expect(snap).toMatchObject({ tick: 0, draws: expect.any(Number) });
    expect(JSON.parse(snap.state as string)).toMatchObject({ t: 0 });
  });

  it('ticks authoritatively and broadcasts what it applied', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));

    // The arrival reaches the sim through the ordered event stream, like everything else.
    const joinDelta = await waitFor(() =>
      client.frames.find((frame) => frame.t === 'delta' && JSON.stringify(frame.ev).includes('"join"')),
    );
    expect(joinDelta.ev).toEqual([{ slot: 0, k: 'join' }]);

    client.send({ t: 'input', k: 'move', d: 'n' });
    const moveDelta = await waitFor(() =>
      client.frames.find((frame) => frame.t === 'delta' && JSON.stringify(frame.ev).includes('"move"')),
    );
    // The slot is attached by the host. The client never sent one and could not have.
    expect(moveDelta.ev).toEqual([{ slot: 0, k: 'move', v: 'n' }]);
  });

  it('carries a checksum about once a second', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });

    const checked = await waitFor(() => client.frames.find((frame) => frame.t === 'delta' && frame.h !== undefined));
    expect(checked.h).toMatch(/^[a-f0-9]{16}$/);
  });

  it('turns away a forged ticket without saying which part was wrong', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({
      t: 'hello',
      zone: 'ember-watch',
      ticket: mintZoneTicket(
        { zone: 'ember-watch', slug: 'ember-watch', player: 'sneaky', expiresAt: Date.now() + 60_000 },
        'not-the-real-secret',
      ),
    });

    const closed = await waitFor(() => client.frames.find((frame) => frame.t === 'closed'));
    // Expired, forged and wrong-zone all read the same. Distinguishing them only helps
    // somebody holding a stolen one.
    expect(closed.reason).toBe('bad_ticket');
  });

  it('turns away a ticket for a game that declares no zone', async () => {
    const { url } = await startHost({ schemas: {} });
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });

    const closed = await waitFor(() => client.frames.find((frame) => frame.t === 'closed'));
    expect(closed.reason).toBe('zone_not_found');
  });

  it('refuses a second hello on one socket', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-b') });

    const closed = await waitFor(() => client.frames.find((frame) => frame.t === 'closed'));
    expect(closed.reason).toBe('already_joined');
  });

  it('hangs up on a frame it cannot parse', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.socket.send('not json at all');

    const closed = await waitFor(() => client.frames.find((frame) => frame.t === 'closed'));
    expect(closed.reason).toBe('bad_frame');
  });

  it('refuses an input before a hello', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'input', k: 'douse' });

    const closed = await waitFor(() => client.frames.find((frame) => frame.t === 'closed'));
    expect(closed.reason).toBe('not_joined');
  });

  it('drops an undeclared input without hanging up on the client', async () => {
    // A client one version behind its game is a normal thing to be. Closing the socket
    // would turn a harmless mismatch into an outage.
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));

    client.send({ t: 'input', k: 'teleport', d: 3 });
    client.send({ t: 'input', k: 'move', d: 'sideways' });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(client.frames.some((frame) => frame.t === 'closed')).toBe(false);
    const applied = client.frames.filter((frame) => frame.t === 'delta').flatMap((frame) => frame.ev as unknown[]);
    expect(JSON.stringify(applied)).not.toContain('teleport');
    expect(JSON.stringify(applied)).not.toContain('sideways');
  });

  it('never lets a client conjure or evict a player', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    // Wait for the host's *own* join event first — it is a legitimate one, and counting
    // it as a violation would make this test pass for the wrong reason.
    await waitFor(() =>
      client.frames.find((frame) => frame.t === 'delta' && JSON.stringify(frame.ev).includes('"join"')),
    );
    const before = client.frames.length;

    // The reserved kinds. `join` would conjure a player into the world; `leave` would
    // evict a real one. Both are facts the host knows, not claims a client may make.
    client.send({ t: 'input', k: 'join' });
    client.send({ t: 'input', k: 'leave', d: 1 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const deltas = client.frames.slice(before).filter((frame) => frame.t === 'delta');
    const events = deltas.flatMap((frame) => frame.ev as Array<{ k: string }>);
    expect(events.some((event) => event.k === 'join' || event.k === 'leave')).toBe(false);
  });

  it('answers a resync with a fresh snapshot', async () => {
    const { url } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => client.frames.find((frame) => frame.t === 'snap'));
    await waitFor(() => client.frames.find((frame) => frame.t === 'delta'));

    const before = client.frames.filter((frame) => frame.t === 'snap').length;
    client.send({ t: 'resync' });
    const resnapped = await waitFor(() => {
      const snaps = client.frames.filter((frame) => frame.t === 'snap');
      return snaps.length > before ? snaps[snaps.length - 1] : undefined;
    });
    expect(resnapped.tick as number).toBeGreaterThan(0);
  });

  it('seats two players in one zone and refuses a third', async () => {
    const { url } = await startHost();
    for (const player of ['player-a', 'player-b']) {
      const client = connect(url);
      await client.open;
      client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor(player) });
      await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));
    }

    const third = connect(url);
    await third.open;
    third.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-c') });
    const closed = await waitFor(() => third.frames.find((frame) => frame.t === 'closed'));
    // A place rather than a session: full is a queue to wait in, and the client's retry
    // loop treats it that way rather than giving up.
    expect(closed.reason).toBe('zone_full');
  });

  it('lets one player replace their own connection rather than seating them twice', async () => {
    const { url } = await startHost();
    const first = connect(url);
    await first.open;
    first.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => first.frames.find((frame) => frame.t === 'welcome'));

    const second = connect(url);
    await second.open;
    second.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    const welcome = await waitFor(() => second.frames.find((frame) => frame.t === 'welcome'));

    // Same seat, and the old tab is told why it is going.
    expect(welcome.slot).toBe(0);
    const closed = await waitFor(() => first.frames.find((frame) => frame.t === 'closed'));
    expect(closed.reason).toBe('replaced');
  });

  it('hibernates the zone once the last player disconnects', async () => {
    const { url, host } = await startHost();
    const client = connect(url);
    await client.open;
    client.send({ t: 'hello', zone: 'ember-watch', ticket: ticketFor('player-a') });
    await waitFor(() => client.frames.find((frame) => frame.t === 'welcome'));
    expect(host.liveZoneCount).toBe(1);

    client.socket.close();
    // The step the whole cost model rests on: no sockets, no zone, and the instance
    // drains on its own.
    await waitFor(() => (host.liveZoneCount === 0 ? true : undefined));
    expect(host.liveZoneCount).toBe(0);
  });
});

import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import {
  InvalidRoomTokenError,
  MAX_SLOTS,
  SLOT_COLORS,
  mintRoomToken,
  RoomRegistry,
  sanitizeNick,
  verifyRoomToken,
  type RelaySocket,
} from './mp.js';
import { InMemoryStore } from '../store.js';

const sessionSecret = 'dev-session-secret-change-me';
const roomSecret = 'room-test-secret';

function authHeaders(uid = 'g:test-user') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

/** Records every frame written to a connection so tests can assert on the relay. */
function fakeSocket(): RelaySocket & { sent: Array<Record<string, unknown>>; closed: string | null } {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    closed: null,
    send(data: string) {
      sent.push(JSON.parse(data) as Record<string, unknown>);
    },
    close(_code?: number, reason?: string) {
      this.closed = reason ?? 'closed';
    },
  };
}

function lastFrame(socket: { sent: Array<Record<string, unknown>> }, type: string) {
  return [...socket.sent].reverse().find((frame) => frame.t === type);
}

function wsUrl(app: FastifyInstance): string {
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `ws://127.0.0.1:${port}/api/mp/ws`;
}

/** Resolves once the connection is actually established, so the cap has counted it. */
function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}

async function createApp(multiplayerRoutes?: { maxSocketsPerIp?: number }): Promise<FastifyInstance> {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  return buildApp({ store, sessionSecret, ...(multiplayerRoutes ? { multiplayerRoutes } : {}) });
}

describe('room tokens', () => {
  it('round-trips a minted token', () => {
    const expiresAt = Date.now() + 60_000;
    const token = mintRoomToken('ABC234', expiresAt, roomSecret);
    expect(verifyRoomToken(token, roomSecret)).toEqual({ code: 'ABC234', expiresAt });
  });

  it('rejects a token signed for the other role', () => {
    const token = mintRoomToken('ABC234', Date.now() + 60_000, roomSecret, 'guest');
    expect(() => verifyRoomToken(token, roomSecret, 'host')).toThrow(InvalidRoomTokenError);
  });

  it('rejects a token signed with another secret', () => {
    const token = mintRoomToken('ABC234', Date.now() + 60_000, 'other-secret');
    expect(() => verifyRoomToken(token, roomSecret)).toThrow(InvalidRoomTokenError);
  });

  it('rejects an expired token', () => {
    const token = mintRoomToken('ABC234', Date.now() - 1, roomSecret);
    expect(() => verifyRoomToken(token, roomSecret)).toThrow(InvalidRoomTokenError);
  });

  it('rejects garbage', () => {
    expect(() => verifyRoomToken('not-a-token', roomSecret)).toThrow(InvalidRoomTokenError);
    expect(() => verifyRoomToken('', roomSecret)).toThrow(InvalidRoomTokenError);
  });

  it('mints codes from an unambiguous alphabet', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const { code } = registry.createRoom('arena-tag', `g:host-${attempt}`, 4);
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    }
  });
});

describe('nickname sanitizing', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizeNick('  Ola\n  Nowak  ')).toBe('Ola Nowak');
  });

  it('caps length so a nickname cannot blow up the shared screen', () => {
    expect(sanitizeNick('x'.repeat(200))).toHaveLength(16);
  });

  it('strips HTML-significant characters at the source', () => {
    expect(sanitizeNick('Ada<script>')).toBe('Adascript');
  });
});

describe('RoomRegistry', () => {
  it('seats guests into successive slots and reports a roster', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    const host = fakeSocket();
    expect(registry.attachHost(room.code, room.hostToken, host)).toBe(true);

    const phone = fakeSocket();
    const slot = registry.attachGuest(room.code, room.joinToken, 'Ada', phone);
    expect(slot?.slot).toBe(1);
    expect(lastFrame(phone, 'welcome')).toMatchObject({ slot: 1, nick: 'Ada' });

    const second = fakeSocket();
    expect(registry.attachGuest(room.code, room.joinToken, 'Bo', second)?.slot).toBe(2);

    const roster = lastFrame(host, 'roster');
    expect(roster?.slots).toMatchObject([
      { slot: 1, nick: 'Ada', connected: true },
      { slot: 2, nick: 'Bo', connected: true },
      { slot: 3, nick: null, connected: false },
      { slot: 4, nick: null, connected: false },
    ]);
  });

  it('refuses a guest holding a host token, and vice versa', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 2);
    expect(registry.attachGuest(room.code, room.hostToken, 'Mallory', fakeSocket())).toBeNull();
    expect(registry.attachHost(room.code, room.joinToken, fakeSocket())).toBe(false);
  });

  it('refuses a token minted for a different room', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const roomA = registry.createRoom('arena-tag', 'g:host-a', 2);
    const roomB = registry.createRoom('arena-tag', 'g:host-b', 2);
    expect(registry.attachGuest(roomA.code, roomB.joinToken, 'Mallory', fakeSocket())).toBeNull();
  });

  it('turns away guests once every slot is taken', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('tactics-duel', 'g:host', 2);
    expect(registry.attachGuest(room.code, room.joinToken, 'A', fakeSocket())).not.toBeNull();
    expect(registry.attachGuest(room.code, room.joinToken, 'B', fakeSocket())).not.toBeNull();
    expect(registry.attachGuest(room.code, room.joinToken, 'C', fakeSocket())).toBeNull();
  });

  it('clamps the slot count to the platform bounds', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    expect(registry.createRoom('x', 'g:a', 99).maxPlayers).toBe(MAX_SLOTS);
    expect(registry.createRoom('x', 'g:b', 1).maxPlayers).toBe(2);
  });

  it('keeps one slot colour per seat', () => {
    // A missing colour would hand a player the fallback instead.
    expect(SLOT_COLORS).toHaveLength(MAX_SLOTS);
  });

  it('relays input to the host tagged with the slot', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    const host = fakeSocket();
    registry.attachHost(room.code, room.hostToken, host);
    const phone = fakeSocket();
    const slot = registry.attachGuest(room.code, room.joinToken, 'Ada', phone);

    registry.relayInput(room.code, slot?.slot ?? 0, 'left', 1);
    expect(lastFrame(host, 'input')).toMatchObject({ slot: 1, k: 'left', d: 1 });

    // A key RELEASE must survive the wire: the value lives in `d` precisely so it
    // cannot collide with `v`, the protocol version stamped on every frame.
    registry.relayInput(room.code, slot?.slot ?? 0, 'left', 0);
    expect(lastFrame(host, 'input')).toMatchObject({ slot: 1, k: 'left', d: 0, v: 1 });
  });

  it('frees the slot when a guest disconnects, leaving the room alive', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    const host = fakeSocket();
    registry.attachHost(room.code, room.hostToken, host);
    registry.attachGuest(room.code, room.joinToken, 'Ada', fakeSocket());

    registry.detachGuest(room.code, 1);
    const slots = lastFrame(host, 'roster')?.slots as Array<Record<string, unknown>>;
    expect(slots[0]).toMatchObject({ slot: 1, nick: null, connected: false });

    // …and the freed slot can be reclaimed (a phone that woke up and reconnected).
    expect(registry.attachGuest(room.code, room.joinToken, 'Ada', fakeSocket())?.slot).toBe(1);
  });

  it('tells every controller when the phase changes', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    registry.attachHost(room.code, room.hostToken, fakeSocket());
    const phone = fakeSocket();
    registry.attachGuest(room.code, room.joinToken, 'Ada', phone);

    registry.setPhase(room.code, 'playing');
    expect(lastFrame(phone, 'phase')).toMatchObject({ phase: 'playing' });
  });

  it('kicks a slot without ending the room', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    registry.attachHost(room.code, room.hostToken, fakeSocket());
    const phone = fakeSocket();
    registry.attachGuest(room.code, room.joinToken, 'Ada', phone);

    registry.releaseSlot(room.code, 1, 'kicked');
    expect(lastFrame(phone, 'closed')).toMatchObject({ reason: 'kicked' });
    expect(phone.closed).toBe('kicked');
    expect(registry.getRoom(room.code)).toBeDefined();
  });

  it('closes controllers when the room closes', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    const host = fakeSocket();
    registry.attachHost(room.code, room.hostToken, host);
    const phone = fakeSocket();
    registry.attachGuest(room.code, room.joinToken, 'Ada', phone);

    registry.closeRoom(room.code, 'host_left');
    expect(lastFrame(phone, 'closed')).toMatchObject({ reason: 'host_left' });
    expect(lastFrame(host, 'closed')).toMatchObject({ reason: 'host_left' });
    expect(registry.getRoom(room.code)).toBeUndefined();
  });

  it('retires a host previous room so one host cannot hoard lobbies', () => {
    const registry = new RoomRegistry({ secret: roomSecret });
    const first = registry.createRoom('arena-tag', 'g:host', 4);
    const second = registry.createRoom('tactics-duel', 'g:host', 2);
    expect(registry.getRoom(first.code)).toBeUndefined();
    expect(registry.getRoom(second.code)).toBeDefined();
    expect(registry.size).toBe(1);
  });

  it('reaps rooms that went idle', () => {
    let now = 1_000_000;
    const registry = new RoomRegistry({ secret: roomSecret, now: () => now });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    now += 16 * 60 * 1000;
    registry.reap();
    expect(registry.getRoom(room.code)).toBeUndefined();
  });

  it('a stale join token cannot seat a guest after expiry', () => {
    let now = 1_000_000;
    const registry = new RoomRegistry({ secret: roomSecret, now: () => now });
    const room = registry.createRoom('arena-tag', 'g:host', 4);
    now += 3 * 60 * 60 * 1000;
    expect(registry.attachGuest(room.code, room.joinToken, 'Late', fakeSocket())).toBeNull();
  });
});

describe('POST /api/mp/sessions', () => {
  it('requires a session', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('creates a room for a signed-in host', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: authHeaders(),
      payload: { slug: 'arena-tag', maxPlayers: 4 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      code: string;
      joinPath: string;
      joinToken: string;
      hostToken: string;
      maxPlayers: number;
    };
    expect(body.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    expect(body.maxPlayers).toBe(4);
    // Hybrid join: code in path, credential in fragment so it never hits access logs.
    expect(body.joinPath).toBe(`/join/${body.code}#${body.joinToken}`);
    expect(body.hostToken).not.toBe('');
    await app.close();
  });

  it('rejects a malformed slug', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: authHeaders(),
      payload: { slug: '../etc/passwd' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rate-limits room creation per IP', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    const app = await buildApp({ store, sessionSecret, multiplayerRoutes: { maxRoomsPerWindow: 2 } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/mp/sessions',
        headers: authHeaders(),
        payload: { slug: 'arena-tag' },
      });
      expect(ok.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: authHeaders(),
      payload: { slug: 'arena-tag' },
    });
    expect(limited.statusCode).toBe(429);
    await app.close();
  });
});

describe('private beta wall', () => {
  it('exempts the controller websocket but nothing else', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: 'g:allowed' });

    // A guest phone has no session: creating a room must still be walled…
    const sessions = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(sessions.statusCode).toBe(401);

    // …as must every other data route (catalog is the cheap stand-in for the wall).
    const catalog = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(catalog.statusCode).toBe(401);

    // …while the websocket path is reachable (it 400s on a plain GET because it
    // wants an upgrade, which is the point: the wall did not answer it).
    const websocket = await app.inject({ method: 'GET', url: '/api/mp/ws' });
    expect(websocket.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('websocket relay', () => {
  it('carries a controller input from a guest to the host', async () => {
    const app = await createApp();
    await app.listen({ port: 0 });

    const created = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: authHeaders(),
      payload: { slug: 'arena-tag', maxPlayers: 2 },
    });
    const room = created.json() as { code: string; hostToken: string; joinToken: string };

    const hostSocket = await app.injectWS('/api/mp/ws');
    const hostFrames: Array<Record<string, unknown>> = [];
    hostSocket.on('message', (data: Buffer) => hostFrames.push(JSON.parse(data.toString()) as Record<string, unknown>));
    hostSocket.send(JSON.stringify({ t: 'hello', code: room.code, token: room.hostToken }));

    const guestSocket = await app.injectWS('/api/mp/ws');
    const guestFrames: Array<Record<string, unknown>> = [];
    guestSocket.on('message', (data: Buffer) =>
      guestFrames.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );
    guestSocket.send(JSON.stringify({ t: 'hello', code: room.code, token: room.joinToken, nick: 'Ada' }));

    await waitFor(() => guestFrames.some((frame) => frame.t === 'welcome'));
    expect(guestFrames.find((frame) => frame.t === 'welcome')).toMatchObject({ slot: 1, nick: 'Ada' });

    guestSocket.send(JSON.stringify({ t: 'input', k: 'right', d: 1 }));
    await waitFor(() => hostFrames.some((frame) => frame.t === 'input'));
    expect(hostFrames.find((frame) => frame.t === 'input')).toMatchObject({ slot: 1, k: 'right', d: 1 });

    hostSocket.close();
    guestSocket.close();
    await app.close();
  });

  /**
   * These two connect over real TCP rather than `injectWS`, because the cap keys on
   * `request.ip` and an injected upgrade has no underlying socket for that getter to
   * read — the connection is deliberately left uncapped in that case, so an injected
   * socket cannot exercise the limit at all.
   */
  it('refuses more concurrent sockets than one address may hold', async () => {
    // The websocket is the one door an anonymous guest reaches, and an idle socket
    // costs the opener nothing while holding memory and a descriptor on a service
    // documented as running a single instance.
    const app = await createApp({ maxSocketsPerIp: 2 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = wsUrl(app);

    const first = await openSocket(url);
    const second = await openSocket(url);

    const third = new WebSocket(url);
    const frames: Array<Record<string, unknown>> = [];
    third.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>));

    await waitFor(() => frames.some((frame) => frame.t === 'closed'));
    expect(frames.find((frame) => frame.t === 'closed')).toMatchObject({ reason: 'too_many_connections' });

    first.close();
    second.close();
    third.close();
    await app.close();
  });

  it('frees the allowance when a socket closes, even one that never joined', async () => {
    // A flood never sends `hello`, so those sockets hold no room — releasing only
    // joined ones would leak the ceiling to exactly the connections it bounds.
    const app = await createApp({ maxSocketsPerIp: 1 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = wsUrl(app);

    const first = await openSocket(url);
    await new Promise<void>((resolve) => {
      first.on('close', () => resolve());
      first.close();
    });

    // The replacement is admitted rather than refused: it reaches normal frame
    // handling, which a connection over the cap never would.
    const second = await openSocket(url);
    const frames: Array<Record<string, unknown>> = [];
    second.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>));
    second.send('not json');

    await waitFor(() => frames.some((frame) => frame.t === 'closed'));
    expect(frames.find((frame) => frame.t === 'closed')).toMatchObject({ reason: 'bad_frame' });

    second.close();
    await app.close();
  });

  it('closes a connection that sends a bad frame', async () => {
    const app = await createApp();
    await app.listen({ port: 0 });

    const socket = await app.injectWS('/api/mp/ws');
    const frames: Array<Record<string, unknown>> = [];
    socket.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.send('this is not json');

    await waitFor(() => frames.some((frame) => frame.t === 'closed'));
    expect(frames.find((frame) => frame.t === 'closed')).toMatchObject({ reason: 'bad_frame' });
    await app.close();
  });

  it('refuses an unknown room code', async () => {
    const app = await createApp();
    await app.listen({ port: 0 });

    const socket = await app.injectWS('/api/mp/ws');
    const frames: Array<Record<string, unknown>> = [];
    socket.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.send(JSON.stringify({ t: 'hello', code: 'ZZZZZZ', token: 'whatever' }));

    await waitFor(() => frames.some((frame) => frame.t === 'closed'));
    expect(frames.find((frame) => frame.t === 'closed')).toMatchObject({ reason: 'room_not_found' });
    await app.close();
  });

  it('refuses input from a connection that never said hello', async () => {
    const app = await createApp();
    await app.listen({ port: 0 });

    const socket = await app.injectWS('/api/mp/ws');
    const frames: Array<Record<string, unknown>> = [];
    socket.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.send(JSON.stringify({ t: 'input', k: 'a', d: 1 }));

    await waitFor(() => frames.some((frame) => frame.t === 'closed'));
    expect(frames.find((frame) => frame.t === 'closed')).toMatchObject({ reason: 'not_joined' });
    await app.close();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for condition');
}

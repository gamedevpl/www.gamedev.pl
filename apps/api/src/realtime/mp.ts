import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_MAX_SOCKETS_PER_IP,
  INPUT_KEYS,
  MAX_SOCKET_FRAME_BYTES,
  MAX_MULTIPLAYER_SLOTS,
  MAX_SOCKET_FRAMES_PER_SECOND,
  MP_PROTOCOL_VERSION,
  ROOM_PHASES,
  type InputKey,
  type RoomPhase,
} from '@gamedevpl/contract';
import { checkUserAccess } from '../auth.js';
import type { InternalAuthVerifier } from '../internal-auth.js';
import type { RelayClient } from './mp-relay.js';

/**
 * Multiplayer room relay (docs/multiplayer-plan.md).
 *
 * The shared screen (host) runs the game in its sandboxed iframe; phones connect
 * as controllers and their input is relayed here, tagged with a slot number. This
 * server is a relay with admission control, NOT a game engine — it never sees or
 * keeps game state, and rooms live only in memory (ephemeral by design: a party
 * session that outlives the party is a privacy liability, not a feature).
 *
 * IMPORTANT: rooms are per-instance state. Cloud Run must run this service with
 * --max-instances 1 while multiplayer is enabled, or a guest can land on an
 * instance that does not hold the host's room. See the plan's §4.6 for the
 * upgrade paths (separate relay service / shared room state).
 */

/** Room codes are read aloud across a table — no 0/O/1/I lookalikes. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** Platform slot palette. Index = slot - 1; the controller renders the same color. */
export const SLOT_COLORS = [
  '#00e4ac',
  '#ff7edb',
  '#ffd56a',
  '#6ee7ff',
  '#9ef7b8',
  '#b4a2ff',
  '#ff9b6a',
  '#f4f5ff',
] as const;

export const MAX_SLOTS: number = MAX_MULTIPLAYER_SLOTS;
export const DEFAULT_SLOTS = 4;

export { INPUT_KEYS, ROOM_PHASES, type InputKey, type RoomPhase };

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_IDLE_MS = 15 * 60 * 1000;
const JOIN_TOKEN_TTL_MS = ROOM_TTL_MS;
/** Frames per second a single connection may send before it is disconnected. */
const MAX_FRAMES_PER_SECOND = MAX_SOCKET_FRAMES_PER_SECOND;
/** Frames larger than this are refused unread — controller frames are tiny. */
const MAX_FRAME_BYTES = MAX_SOCKET_FRAME_BYTES;

/** A connection we can write to. Kept structural so tests need no real socket. */
export interface RelaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Slot {
  slot: number;
  color: string;
  nick: string | null;
  socket: RelaySocket | null;
  claimedAt: number;
}

interface Room {
  code: string;
  slug: string;
  ownerUid: string;
  slots: Slot[];
  host: RelaySocket | null;
  phase: RoomPhase;
  createdAt: number;
  lastActivity: number;
}

export class InvalidRoomTokenError extends Error {
  constructor(message = 'invalid room token') {
    super(message);
    this.name = 'InvalidRoomTokenError';
  }
}

/**
 * Room tokens are HMACs over the room code + expiry, scoped so a room token can
 * never be mistaken for (or forged from) a session cookie even though both are
 * keyed off SESSION_SECRET.
 */
function signRoom(code: string, expiresAt: number, secret: string, role: 'host' | 'guest'): string {
  return createHmac('sha256', secret).update(`mp-room-v1:${role}:${code}:${expiresAt}`).digest('hex');
}

export function mintRoomToken(
  code: string,
  expiresAt: number,
  secret: string,
  role: 'host' | 'guest' = 'guest',
): string {
  const signature = signRoom(code, expiresAt, secret, role);
  return Buffer.from(`${code}.${expiresAt}.${signature}`, 'utf8').toString('base64url');
}

export function verifyRoomToken(
  token: string,
  secret: string,
  role: 'host' | 'guest' = 'guest',
  now: number = Date.now(),
): { code: string; expiresAt: number } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    throw new InvalidRoomTokenError();
  }

  const parts = decoded.split('.');
  if (parts.length !== 3) {
    throw new InvalidRoomTokenError();
  }

  const [code, expiresAtRaw, signature] = parts;
  if (
    !code ||
    !expiresAtRaw ||
    !signature ||
    !isRoomCode(code) ||
    !/^\d+$/.test(expiresAtRaw) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    throw new InvalidRoomTokenError();
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new InvalidRoomTokenError();
  }

  const expected = signRoom(code, expiresAt, secret, role);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new InvalidRoomTokenError();
  }

  return { code, expiresAt };
}

export function isRoomCode(value: string): boolean {
  return value.length === CODE_LENGTH && [...value].every((character) => CODE_ALPHABET.includes(character));
}

function generateCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Nicknames are typed by anonymous guests and shown on a shared screen, so they
 * are stripped to plain printable text and length-capped here. (The web shell
 * additionally renders them escaped — this is defense in depth, not the only
 * guard.) Content moderation of the resulting text is the caller's job.
 */
export function sanitizeNick(raw: string): string {
  const collapsed = raw
    .replace(/[\p{C}]/gu, '')
    // Strip the HTML-significant characters at the source too, so the relayed
    // value is already inert. Both consumers (the React lobby and the game's
    // canvas fillText) escape it as well — this is belt-and-braces.
    .replace(/[<>&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.slice(0, 16);
}

const HelloFrameSchema = z.object({
  t: z.literal('hello'),
  code: z.string(),
  token: z.string(),
  nick: z.string().optional(),
});

// The value field is `d`, not `v`: every frame carries `v` as the protocol
// version, and a key-release (0) would otherwise overwrite it and be rejected as
// a version mismatch by the other side.
const InputFrameSchema = z.object({
  t: z.literal('input'),
  k: z.enum(INPUT_KEYS),
  d: z.union([z.literal(0), z.literal(1)]),
});

const PhaseFrameSchema = z.object({
  t: z.literal('phase'),
  phase: z.enum(ROOM_PHASES),
});

const KickFrameSchema = z.object({
  t: z.literal('kick'),
  slot: z.number().int().min(1).max(MAX_SLOTS),
});

const ByeFrameSchema = z.object({ t: z.literal('bye') });

const ClientFrameSchema = z.discriminatedUnion('t', [
  HelloFrameSchema,
  InputFrameSchema,
  PhaseFrameSchema,
  KickFrameSchema,
  ByeFrameSchema,
]);

export interface RoomRegistryOptions {
  /** Secret used to sign room tokens. Defaults to SESSION_SECRET (dev fallback in non-prod). */
  secret?: string;
  now?: () => number;
}

export interface CreateRoomResult {
  code: string;
  hostToken: string;
  joinToken: string;
  joinPath: string;
  maxPlayers: number;
  expiresAt: number;
}

/**
 * In-memory room registry. Split out from the route wiring so the relay logic is
 * unit-testable against plain fake sockets.
 */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private secret: string;
  private now: () => number;

  constructor(options: RoomRegistryOptions = {}) {
    const secret = options.secret ?? process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required to sign room tokens in production');
    }
    this.secret = secret ?? 'dev-session-secret-change-me';
    this.now = options.now ?? (() => Date.now());
  }

  createRoom(slug: string, ownerUid: string, requestedSlots: number): CreateRoomResult {
    this.reap();

    // One open room per host: starting a new lobby retires the previous one so a
    // forgotten tab can't pin slots or leak a live join token.
    for (const [code, room] of this.rooms) {
      if (room.ownerUid === ownerUid) {
        this.closeRoom(code, 'replaced');
      }
    }

    const maxPlayers = Math.min(Math.max(Math.trunc(requestedSlots) || DEFAULT_SLOTS, 2), MAX_SLOTS);
    let code = generateCode();
    while (this.rooms.has(code)) {
      code = generateCode();
    }

    const createdAt = this.now();
    const room: Room = {
      code,
      slug,
      ownerUid,
      slots: Array.from({ length: maxPlayers }, (_, index) => ({
        slot: index + 1,
        color: SLOT_COLORS[index] ?? SLOT_COLORS[0],
        nick: null,
        socket: null,
        claimedAt: 0,
      })),
      host: null,
      phase: 'lobby',
      createdAt,
      lastActivity: createdAt,
    };
    this.rooms.set(code, room);

    const expiresAt = createdAt + JOIN_TOKEN_TTL_MS;
    // Hybrid join URL: room code in the path, credential in the fragment so it
    // never hits access logs or Referer (docs/path-routing-plan.md).
    const joinToken = mintRoomToken(code, expiresAt, this.secret, 'guest');
    return {
      code,
      hostToken: mintRoomToken(code, expiresAt, this.secret, 'host'),
      joinToken,
      joinPath: `/join/${code}#${joinToken}`,
      maxPlayers,
      expiresAt,
    };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Attaches the shared screen. Returns false when the token/room doesn't check out. */
  attachHost(code: string, token: string, socket: RelaySocket): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    try {
      const verified = verifyRoomToken(token, this.secret, 'host', this.now());
      if (verified.code !== code) return false;
    } catch {
      return false;
    }

    // A reconnecting host replaces the old socket rather than opening a second one.
    room.host?.close(1000, 'replaced');
    room.host = socket;
    room.lastActivity = this.now();
    this.sendTo(socket, { t: 'ready', code: room.code, slug: room.slug, phase: room.phase });
    this.broadcastRoster(room);
    return true;
  }

  /** Seats a guest. Returns the assigned slot, or null when refused. */
  attachGuest(code: string, token: string, nick: string, socket: RelaySocket): Slot | null {
    const room = this.rooms.get(code);
    if (!room || room.phase === 'ended') return null;
    try {
      const verified = verifyRoomToken(token, this.secret, 'guest', this.now());
      if (verified.code !== code) return null;
    } catch {
      return null;
    }

    const slot = room.slots.find((candidate) => candidate.socket === null);
    if (!slot) return null;

    slot.socket = socket;
    slot.nick = sanitizeNick(nick) || `Player ${slot.slot}`;
    slot.claimedAt = this.now();
    room.lastActivity = slot.claimedAt;

    this.sendTo(socket, {
      t: 'welcome',
      slot: slot.slot,
      color: slot.color,
      nick: slot.nick,
      phase: room.phase,
    });
    this.broadcastRoster(room);
    return slot;
  }

  /** Relays one controller input to the shared screen. */
  relayInput(code: string, slot: number, key: InputKey, value: 0 | 1): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.lastActivity = this.now();
    if (room.host) {
      this.sendTo(room.host, { t: 'input', slot, k: key, d: value });
    }
  }

  setPhase(code: string, phase: RoomPhase): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.phase = phase;
    room.lastActivity = this.now();
    for (const slot of room.slots) {
      if (slot.socket) this.sendTo(slot.socket, { t: 'phase', phase });
    }
  }

  releaseSlot(code: string, slot: number, reason: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const target = room.slots.find((candidate) => candidate.slot === slot);
    if (!target?.socket) return;
    const socket = target.socket;
    target.socket = null;
    target.nick = null;
    socket.send(JSON.stringify({ t: 'closed', reason }));
    socket.close(1000, reason);
    room.lastActivity = this.now();
    this.broadcastRoster(room);
  }

  detachHost(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.host = null;
    room.lastActivity = this.now();
  }

  /** Drops a guest's socket without ending the room — the slot falls back to its keyboard binding. */
  detachGuest(code: string, slot: number): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const target = room.slots.find((candidate) => candidate.slot === slot);
    if (!target) return;
    target.socket = null;
    target.nick = null;
    room.lastActivity = this.now();
    this.broadcastRoster(room);
  }

  closeRoom(code: string, reason: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.phase = 'ended';
    for (const slot of room.slots) {
      if (slot.socket) {
        this.sendTo(slot.socket, { t: 'closed', reason });
        slot.socket.close(1000, reason);
        slot.socket = null;
      }
    }
    if (room.host) {
      this.sendTo(room.host, { t: 'closed', reason });
      room.host.close(1000, reason);
      room.host = null;
    }
    this.rooms.delete(code);
  }

  /** Drops rooms past their TTL or idle window. Called on every room creation. */
  reap(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > ROOM_TTL_MS || now - room.lastActivity > ROOM_IDLE_MS) {
        this.closeRoom(code, 'expired');
      }
    }
  }

  rosterOf(code: string): Array<{ slot: number; color: string; nick: string | null; connected: boolean }> {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.slots.map((slot) => ({
      slot: slot.slot,
      color: slot.color,
      nick: slot.nick,
      connected: slot.socket !== null,
    }));
  }

  private broadcastRoster(room: Room): void {
    const roster = this.rosterOf(room.code);
    if (room.host) {
      this.sendTo(room.host, { t: 'roster', slots: roster });
    }
    for (const slot of room.slots) {
      if (slot.socket) {
        this.sendTo(slot.socket, { t: 'roster', slots: roster });
      }
    }
  }

  private sendTo(socket: RelaySocket, payload: Record<string, unknown>): void {
    try {
      socket.send(JSON.stringify({ v: MP_PROTOCOL_VERSION, ...payload }));
    } catch {
      // A dead socket is not an error worth failing a room over — the close
      // handler will clean it up.
    }
  }
}

/** Sliding-window frame limiter for one connection. */
class FrameLimiter {
  private timestamps: number[] = [];

  allow(now: number): boolean {
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < 1000);
    if (this.timestamps.length >= MAX_FRAMES_PER_SECOND) return false;
    this.timestamps.push(now);
    return true;
  }
}

export interface MultiplayerRoutesOptions {
  registry?: RoomRegistry;
  /** Max rooms one IP may open per hour. */
  maxRoomsPerWindow?: number;
  /** Max controller/host sockets one IP may hold open at once. */
  maxSocketsPerIp?: number;
  /**
   * Set on the **app** service once the relay is split out (`mp-relay.ts`): room creation
   * is forwarded here instead of running against a local registry, and the websocket is
   * not served at all. Unset keeps everything in one process, which is what local
   * development and every test below run against.
   */
  relayClient?: RelayClient;
  /**
   * Set on the **relay** service. It serves the websocket and an internal, OIDC-verified
   * create route — never the public, cookie-authenticated one, because the session cookie
   * does not (and must not) reach the relay's origin.
   */
  relayOnly?: boolean;
  /** Verifies the app service's OIDC token on the internal create route. */
  internalAuth?: InternalAuthVerifier;
}

/**
 * A shared screen plus a full lobby of phones is `MAX_SLOTS + 1` sockets, and they
 * are normally on one household's wifi — so the default clears two simultaneous
 * parties from a single address, leaving room for reconnect overlap.
 */
export { DEFAULT_MAX_SOCKETS_PER_IP };

/**
 * The address to bucket a connection under, or null when it cannot be determined.
 *
 * `request.ip` is the value we want — `trustProxy` resolves the real client rather
 * than Cloud Run's proxy, which is the whole reason app.ts sets it — but the getter
 * reads `raw.socket.remoteAddress`, and an upgrade request with no underlying socket
 * makes it throw rather than return undefined.
 *
 * Null (rather than a shared "unknown" bucket) is the deliberate choice: connections
 * we cannot classify simply are not capped. Collapsing them together would let one
 * unclassifiable transport exhaust a single bucket and lock everyone out of
 * multiplayer — a cap that takes down the feature it protects is worse than no cap,
 * and the fail-open case degrades to exactly the behaviour that shipped before this.
 */
function connectionAddress(request: FastifyRequest): string | null {
  try {
    return request.ip || null;
  } catch {
    return null;
  }
}

const CreateSessionSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
  maxPlayers: z.number().int().min(2).max(MAX_SLOTS).optional(),
});

/**
 * The internal variant carries the owner's uid, because the relay has no session to read
 * it from. The app service has already checked access and rate-limited by the time this
 * is sent; the uid is what preserves the one-open-room-per-host rule inside the registry.
 */
const InternalCreateSessionSchema = CreateSessionSchema.extend({
  ownerUid: z.string().trim().min(1).max(200),
});

function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    return true;
  }
  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}

export async function registerMultiplayerRoutes(
  app: FastifyInstance,
  options: MultiplayerRoutesOptions = {},
): Promise<void> {
  const registry = options.registry ?? new RoomRegistry();
  const maxRoomsPerWindow = options.maxRoomsPerWindow ?? 30;
  const roomsByIp = new Map<string, number[]>();
  const maxSocketsPerIp = options.maxSocketsPerIp ?? DEFAULT_MAX_SOCKETS_PER_IP;
  /** Live socket count per address. Entries are deleted at zero, so this cannot grow. */
  const socketsByIp = new Map<string, number>();

  // Hosting a room is an authenticated, rate-limited action. Guests never touch
  // this route — they arrive over the websocket with a room token instead.
  //
  // The relay service does NOT serve this route: it has no session cookie to check, by
  // design. It gets the internal one below instead.
  if (!options.relayOnly) {
    app.post('/api/mp/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkUserAccess(request, reply)) return reply;

      const parsed = CreateSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      if (isRateLimited(roomsByIp, request.ip, Date.now(), maxRoomsPerWindow, 60 * 60 * 1000)) {
        return reply.status(429).send({ error: 'too many rooms' });
      }

      const ownerUid = request.user?.uid ?? 'unknown';
      const maxPlayers = parsed.data.maxPlayers ?? DEFAULT_SLOTS;

      // Rate limiting and the access check stay HERE, on the cookie-bearing origin, even
      // when the room itself is created elsewhere. The relay must never be the place that
      // decides who is allowed to host.
      if (options.relayClient) {
        try {
          const created = await options.relayClient.createRoom({
            slug: parsed.data.slug,
            ownerUid,
            maxPlayers,
          });
          return reply.send(created);
        } catch (err) {
          // A relay that is down means no party, not a broken site: everything else on
          // this service keeps working, so answer honestly rather than 500-ing.
          request.log.error({ err }, 'relay room creation failed');
          return reply.status(503).send({ error: 'party mode is unavailable' });
        }
      }

      const created = registry.createRoom(parsed.data.slug, ownerUid, maxPlayers);
      return reply.send(created);
    });
  }

  // The relay's own create route. Reachable only by the app service, proving itself with a
  // Google-signed OIDC token minted for this service's URL — the same shape the sweep
  // endpoints use. It is deliberately NOT cookie-authenticated: extending the session
  // cookie to a second origin to save one hop would widen its blast radius for nothing.
  if (options.relayOnly) {
    app.post('/api/internal/mp/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
      const verifier = options.internalAuth;
      if (!verifier || !(await verifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }

      const parsed = InternalCreateSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const created = registry.createRoom(
        parsed.data.slug,
        parsed.data.ownerUid,
        parsed.data.maxPlayers ?? DEFAULT_SLOTS,
      );
      return reply.send(created);
    });
  }

  // One websocket endpoint for both roles. The first frame decides which: a host
  // token attaches the shared screen, a guest token claims a controller slot.
  // Deliberately NO credential in the URL — query strings land in access logs.
  // Once the relay is split out, the app service must NOT serve the socket: it has no
  // registry worth connecting to, and answering here is how a guest silently lands on the
  // wrong instance — the exact failure `--max-instances 1` exists to prevent, reintroduced
  // by a different route. Serving nothing makes the misconfiguration loud instead.
  if (options.relayClient) return;

  app.get('/api/mp/ws', { websocket: true }, (socket, request) => {
    const limiter = new FrameLimiter();
    let role: 'none' | 'host' | 'guest' = 'none';
    let roomCode: string | null = null;
    let slotNumber = 0;

    const closeWith = (reason: string) => {
      try {
        socket.send(JSON.stringify({ v: MP_PROTOCOL_VERSION, t: 'closed', reason }));
      } catch {
        // socket already gone
      }
      socket.close(1000, reason);
    };

    // This is the one door an anonymous guest may reach, and until now nothing
    // limited how many they could hold open. Everything *inside* a connection is
    // bounded (4KB payloads, 2KB frames, 40 fps) but an idle socket costs memory and
    // a file descriptor while costing the opener nothing — and multiplayer is
    // documented as running on a single instance (see the note at the top of this
    // file), so there is no second container to absorb a flood.
    //
    // The ceiling has to clear a real party comfortably: the phones and the shared
    // screen are usually on the same wifi, so one household is legitimately
    // MAX_SLOTS + 1 sockets at once, plus reconnect overlap.
    const ip = connectionAddress(request);
    if (ip !== null) {
      const openForIp = socketsByIp.get(ip) ?? 0;
      if (openForIp >= maxSocketsPerIp) {
        closeWith('too_many_connections');
        return;
      }
      socketsByIp.set(ip, openForIp + 1);
    }

    // Exactly once, whichever of close/error fires (both can, and both call onClose).
    let released = false;
    const releaseSocket = () => {
      if (released || ip === null) return;
      released = true;
      const remaining = (socketsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) socketsByIp.set(ip, remaining);
      else socketsByIp.delete(ip);
    };

    const onMessage = (raw: unknown) => {
      const text = typeof raw === 'string' ? raw : String(raw);
      if (text.length > MAX_FRAME_BYTES) {
        closeWith('frame_too_large');
        return;
      }
      if (!limiter.allow(Date.now())) {
        closeWith('rate_limited');
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        closeWith('bad_frame');
        return;
      }

      const frame = ClientFrameSchema.safeParse(parsedJson);
      if (!frame.success) {
        closeWith('bad_frame');
        return;
      }

      const message = frame.data;

      if (message.t === 'hello') {
        if (role !== 'none') {
          closeWith('already_joined');
          return;
        }
        if (!isRoomCode(message.code)) {
          closeWith('room_not_found');
          return;
        }
        if (!registry.getRoom(message.code)) {
          closeWith('room_not_found');
          return;
        }

        // A host token is only ever minted for the creator's own tab, so trying
        // it first costs nothing and keeps one endpoint for both roles.
        if (registry.attachHost(message.code, message.token, socket)) {
          role = 'host';
          roomCode = message.code;
          return;
        }

        const slot = registry.attachGuest(message.code, message.token, message.nick ?? '', socket);
        if (!slot) {
          closeWith('room_full_or_invalid');
          return;
        }
        role = 'guest';
        roomCode = message.code;
        slotNumber = slot.slot;
        return;
      }

      if (!roomCode) {
        closeWith('not_joined');
        return;
      }

      if (message.t === 'input') {
        if (role !== 'guest') {
          closeWith('not_a_controller');
          return;
        }
        registry.relayInput(roomCode, slotNumber, message.k, message.d);
        return;
      }

      if (message.t === 'phase') {
        if (role !== 'host') {
          closeWith('not_the_host');
          return;
        }
        registry.setPhase(roomCode, message.phase);
        return;
      }

      if (message.t === 'kick') {
        if (role !== 'host') {
          closeWith('not_the_host');
          return;
        }
        registry.releaseSlot(roomCode, message.slot, 'kicked');
        return;
      }

      if (message.t === 'bye') {
        closeWith('bye');
      }
    };

    const onClose = () => {
      // Before the early return below: a socket that never sent `hello` has no room,
      // and that is precisely the shape a flood takes — releasing only joined sockets
      // would leak the ceiling to the connections it exists to bound.
      releaseSocket();
      if (!roomCode) return;
      if (role === 'host') {
        // The shared screen going away ends the party — controllers are useless
        // without it, and a room with no host is just a live token nobody watches.
        registry.closeRoom(roomCode, 'host_left');
      } else if (role === 'guest') {
        registry.detachGuest(roomCode, slotNumber);
      }
    };

    socket.on('message', (payload: unknown) => onMessage(payload));
    socket.on('close', () => onClose());
    socket.on('error', () => onClose());
  });
}

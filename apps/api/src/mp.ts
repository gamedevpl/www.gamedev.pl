import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { checkUserAccess } from './auth.js';

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

export const MAX_SLOTS = SLOT_COLORS.length;
export const DEFAULT_SLOTS = 4;

/** The v1 controller layout: a d-pad plus one action button. */
const INPUT_KEYS = ['up', 'down', 'left', 'right', 'a'] as const;
export type InputKey = (typeof INPUT_KEYS)[number];

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_IDLE_MS = 15 * 60 * 1000;
const JOIN_TOKEN_TTL_MS = ROOM_TTL_MS;
/** Frames per second a single connection may send before it is disconnected. */
const MAX_FRAMES_PER_SECOND = 40;
/** Frames larger than this are refused unread — controller frames are tiny. */
const MAX_FRAME_BYTES = 2 * 1024;

export type RoomPhase = 'lobby' | 'playing' | 'ended';

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
  phase: z.enum(['lobby', 'playing', 'ended']),
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
      socket.send(JSON.stringify({ v: 1, ...payload }));
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
}

const CreateSessionSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
  maxPlayers: z.number().int().min(2).max(MAX_SLOTS).optional(),
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

  // Hosting a room is an authenticated, rate-limited action. Guests never touch
  // this route — they arrive over the websocket with a room token instead.
  app.post('/api/mp/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkUserAccess(request, reply)) return reply;

    const parsed = CreateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    if (isRateLimited(roomsByIp, request.ip, Date.now(), maxRoomsPerWindow, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'too many rooms' });
    }

    const created = registry.createRoom(
      parsed.data.slug,
      request.user?.uid ?? 'unknown',
      parsed.data.maxPlayers ?? DEFAULT_SLOTS,
    );
    return reply.send(created);
  });

  // One websocket endpoint for both roles. The first frame decides which: a host
  // token attaches the shared screen, a guest token claims a controller slot.
  // Deliberately NO credential in the URL — query strings land in access logs.
  app.get('/api/mp/ws', { websocket: true }, (socket) => {
    const limiter = new FrameLimiter();
    let role: 'none' | 'host' | 'guest' = 'none';
    let roomCode: string | null = null;
    let slotNumber = 0;

    const closeWith = (reason: string) => {
      try {
        socket.send(JSON.stringify({ v: 1, t: 'closed', reason }));
      } catch {
        // socket already gone
      }
      socket.close(1000, reason);
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

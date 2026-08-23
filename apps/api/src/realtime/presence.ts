import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rememberBounded } from '../platform/bounded-map.js';
import type { PresenceGrid, WorldSchema } from './world-schema.js';
import type { WorldSchemaSource } from './world-source.js';

/**
 * Ambient co-presence in a shared world (docs/persistent-world-plan.md, phase P2.5).
 *
 * P2 left this out on purpose — "a world is a document set with rules, not a session" —
 * and named it the natural next thing to want. This is the smallest honest version of it:
 * how many people are in a world right now, and roughly where, with **no authority of any
 * kind**. Nothing here validates a position against anything, nothing collides, and two
 * players cannot affect each other. Authoritative shared simulation is P3's job and this
 * is deliberately not a down payment on it — the plan's option B says the server enforces
 * generic constraints and nothing else, and a roster is about as generic as it gets.
 *
 * Same bridge as the rest: the game is sandboxed with no network at all, so its GameKit
 * `presence` module postMessages the trusted shell, and the shell makes these requests on
 * a heartbeat *it* controls. That last part is not incidental. A liveness feature whose
 * request rate was set by untrusted code inside an iframe would be a denial-of-service
 * surface with a friendly name.
 *
 * Three decisions carry most of the weight.
 *
 * **1. Nothing is stored.** Presence lives in this process's memory with a TTL and is
 * gone when it expires. That is not a shortcut around the privacy work — it *is* the
 * privacy work. Every durable collection on this platform has to join the erasure walk in
 * `erase-player-signals.ts` the day it is created (invariant 4 in the plan's §7), and the
 * best way to satisfy an erasure obligation is to have nothing to erase. There is no
 * presence document, no presence index, and consequently no change to the erase path and
 * no new way for its ordering invariant to be broken. The cost is real and worth naming:
 * a deploy empties every roster, and rosters do not survive a second instance. Both are
 * survivable — players reappear within one heartbeat — and the second is the same
 * constraint `mp.ts` rooms already live under at `--max-instances 1`. When that pin
 * falls, presence needs the same zone-directory work rooms do (plan §8), not a database.
 *
 * **2. No identity crosses the line, and specifically not a linkable one.** A peer is a
 * tag, a column and a row. The tag is an HMAC-shaped hash over a salt generated fresh in
 * this process at boot and never written anywhere, so it is stable for as long as a
 * player keeps playing and meaningless afterwards — nobody, including us later, can
 * recompute what it was. Critically it uses a **different** salt from `worldOwnerTag`:
 * if the two matched, a game could tell that the wanderer standing over there is the one
 * who planted this, which is a fact about a real person's habits — where they are, right
 * now, tied to what they have built — that no part of this feature is meant to publish.
 *
 * **3. Reads are public; appearing needs an account.** Straight from P2's lesson: a
 * count nobody may look at until they sign in shows an empty world to precisely the
 * visitor deciding whether an account is worth having. Appearing is the write, and
 * requiring a session for it also settles inflation for free — a slot is keyed by uid, so
 * one account is one slot no matter how many tabs it opens, and there is no anonymous
 * token anybody can mint a thousand of.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

/**
 * A position is advisory, so it is optional and out-of-range values are clamped rather
 * than refused. A player whose heartbeat is rejected over a coordinate vanishes from the
 * roster entirely, which is a much worse outcome than being drawn one tile off.
 */
const BeatSchema = z
  .object({
    col: z.number().finite().optional(),
    row: z.number().finite().optional(),
  })
  .optional();

/**
 * How long a slot survives its last heartbeat.
 *
 * Three missed beats at the shell's cadence. Long enough that a phone switching from
 * wifi to cellular mid-walk does not blink out of the world; short enough that "someone
 * else is here now" is not quietly reporting somebody who closed the tab a minute ago.
 * Reported to the game as `ttlMs` so it can draw a peer as vaguely as the number
 * deserves rather than as a confident figure.
 */
export const PRESENCE_TTL_MS = 40_000;
/** What the shell aims for. Exported so the two halves cannot drift into three beats. */
export const PRESENCE_HEARTBEAT_MS = 12_000;
/**
 * Slots per world, and worlds held at once.
 *
 * The first bounds the response every visitor to a popular game receives; the second
 * bounds this process. Both are LRU rather than lazily swept, because the keys are
 * effectively unbounded from the outside and a sweep that only runs above a threshold is
 * the exact pattern `bounded-map.ts` exists to replace.
 */
export const MAX_PRESENT_PER_WORLD = 64;
const MAX_PRESENT_WORLDS = 512;
/**
 * Peers returned in one response. Below the slot cap on purpose: `count` stays honest
 * for a crowded world while the payload — and the number of figures a game is asked to
 * draw — stays something a phone can render.
 */
const MAX_PEERS_RETURNED = 32;

/**
 * Two salts, both random per process and never persisted.
 *
 * Separate rather than one used twice. `slotKey` is what this map is keyed by and never
 * leaves the server; `tag` is handed to every other player. Deriving both from one salt
 * would mean the value we index by is disclosed, which costs nothing today and is the
 * kind of thing that becomes load-bearing three refactors later.
 */
const SLOT_SALT = randomBytes(32).toString('hex');
const TAG_SALT = randomBytes(32).toString('hex');

function slotKeyFor(worldId: string, uid: string): string {
  return createHash('sha256').update(`${SLOT_SALT}:${worldId}:${uid}`).digest('hex').slice(0, 32);
}

/**
 * The handle other players see. Eight hex characters — enough that two people in one
 * world colliding is a curiosity rather than a bug, and short enough that nobody mistakes
 * it for something meaningful.
 */
function tagFor(worldId: string, uid: string): string {
  return createHash('sha256').update(`${TAG_SALT}:${worldId}:${uid}`).digest('hex').slice(0, 8);
}

interface PresenceSlot {
  tag: string;
  col: number;
  row: number;
  expiresAt: number;
}

export interface PresencePeer {
  tag: string;
  col: number;
  row: number;
}

export interface PresenceRoster {
  count: number;
  peers: PresencePeer[];
  /** Whether the asking player is in this roster. Never inferred from the numbers. */
  present: boolean;
}

/**
 * The whole store: worlds → slots, in memory, with no persistence behind it.
 *
 * A class rather than module-level state so tests can hold one, and so the deliberate
 * absence of a `Store` here is visible in the type rather than only in a comment. If
 * presence ever grows a durable half, this is the constructor that would have to take
 * one — and the erase path would have to change in the same commit.
 */
export class PresenceRegistry {
  private readonly worlds = new Map<string, Map<string, PresenceSlot>>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Drops expired slots, and the world itself once nobody is left in it. */
  private sweep(worldId: string): Map<string, PresenceSlot> | null {
    const world = this.worlds.get(worldId);
    if (!world) return null;
    const at = this.now();
    for (const [key, slot] of world) {
      if (slot.expiresAt <= at) world.delete(key);
    }
    // An empty world is not kept around waiting to be evicted: a game nobody is playing
    // should cost this process nothing at all.
    if (world.size === 0) {
      this.worlds.delete(worldId);
      return null;
    }
    return world;
  }

  /** Records this player as present, and returns the world as everyone else sees it. */
  beat(worldId: string, uid: string, grid: PresenceGrid, position: { col?: number; row?: number }): PresenceRoster {
    this.sweep(worldId);
    let world = this.worlds.get(worldId);
    if (!world) {
      world = new Map();
      this.worlds.set(worldId, world);
    }

    const key = slotKeyFor(worldId, uid);
    const previous = world.get(key);
    const slot: PresenceSlot = {
      tag: tagFor(worldId, uid),
      // A beat with no position keeps whichever tile was last reported rather than
      // snapping the player to the origin — the shell sends one before the game has
      // said where it is, and a wanderer teleporting to 0,0 for one poll is a visible
      // bug with no cause anybody could find.
      col: clamp(position.col ?? previous?.col ?? 0, grid.cols),
      row: clamp(position.row ?? previous?.row ?? 0, grid.rows),
      expiresAt: this.now() + PRESENCE_TTL_MS,
    };
    // LRU by way of `rememberBounded`, so a world at its cap loses whoever beat longest
    // ago rather than refusing the newcomer. Refusing would make a full world permanently
    // full, since the people in it keep renewing.
    rememberBounded(world, key, slot, MAX_PRESENT_PER_WORLD);
    rememberBounded(this.worlds, worldId, world, MAX_PRESENT_WORLDS);

    return this.roster(worldId, key);
  }

  /** Withdraws a player — the theater closing, or a game leaving its world behind. */
  leave(worldId: string, uid: string): void {
    const world = this.worlds.get(worldId);
    if (!world) return;
    world.delete(slotKeyFor(worldId, uid));
    if (world.size === 0) this.worlds.delete(worldId);
  }

  /**
   * Who is here, excluding `selfKey` from `peers` but never from `count`.
   *
   * The split matters for what a game can honestly say. `count` is "how many people are
   * on this green", which includes you; `peers` is "who to draw", which does not.
   */
  roster(worldId: string, selfKey?: string): PresenceRoster {
    const world = this.sweep(worldId);
    if (!world) return { count: 0, peers: [], present: false };

    const peers: PresencePeer[] = [];
    for (const [key, slot] of world) {
      if (key === selfKey) continue;
      // Capped rather than truncated silently in the caller: `count` stays honest for a
      // crowded world while `peers` stays something a phone can draw. It also means
      // `present` cannot be derived from comparing the two — hence the explicit flag,
      // which a full world would otherwise get wrong in the visitor's favour.
      if (peers.length >= MAX_PEERS_RETURNED) break;
      peers.push({ tag: slot.tag, col: slot.col, row: slot.row });
    }
    return { count: world.size, peers, present: selfKey !== undefined && world.has(selfKey) };
  }

  /** Test seam: how many worlds this process is holding. Should return to 0 on its own. */
  get worldCount(): number {
    return this.worlds.size;
  }
}

/**
 * Positions are clamped, never refused — see `BeatSchema`. Non-integers are truncated
 * because the declared space is tiles: a game reporting 3.7 means the fourth column, and
 * rejecting it would only teach authors to round before every call.
 */
function clamp(value: number, size: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), size - 1);
}

export interface PresenceRoutesOptions {
  /**
   * Deliberately no `store`. Presence keeps nothing durable, and the absence of a
   * Firestore handle here is the enforcement of that — see the note at the top on why
   * "nothing to erase" is the privacy posture rather than a shortcut around it.
   */
  worlds?: WorldSchemaSource | null;
  registry?: PresenceRegistry;
}

export async function registerPresenceRoutes(app: FastifyInstance, options: PresenceRoutesOptions): Promise<void> {
  const { worlds } = options;
  const registry = options.registry ?? new PresenceRegistry();

  /**
   * Today a world's roster is keyed by its worldId, which is the slug — the same opaque
   * identity `worlds.ts` uses, and kept opaque here for the same reason: per-creator or
   * seasonal worlds should be a new id rather than a migration.
   */
  function worldIdFor(slug: string): string {
    return slug;
  }

  /**
   * A world only has a roster if it declared one. Returns the grid, or null for "there
   * is no presence here", which covers an unpublished game, a game with no world, a
   * world that declares no presence block, and a declaration that did not parse. A game
   * cannot act differently on any of those and distinguishing them would leak whether a
   * slug exists.
   */
  async function gridFor(slug: string): Promise<PresenceGrid | null> {
    const schema: WorldSchema | null = (await worlds?.getSchema(slug)) ?? null;
    return schema?.presence ?? null;
  }

  function reply(roster: PresenceRoster, visible: boolean) {
    return {
      count: roster.count,
      peers: roster.peers,
      // Reported rather than left to the client to infer, so a game can say "sign in to
      // be seen here" instead of leaving somebody invisible without mentioning it.
      visible,
      ttlMs: PRESENCE_TTL_MS,
      heartbeatMs: PRESENCE_HEARTBEAT_MS,
    };
  }

  app.get('/api/games/:slug/presence', async (request, response) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return response.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    const grid = await gridFor(params.data.slug);
    if (!grid) return response.status(404).send({ error: 'presence not found' });

    const worldId = worldIdFor(params.data.slug);
    const uid = request.user?.uid;
    const selfKey = uid ? slotKeyFor(worldId, uid) : undefined;
    // A signed-in visitor who has not beaten yet reads as not visible, which is true:
    // reading the roster does not put you in it.
    const roster = registry.roster(worldId, selfKey);
    return response.send(reply(roster, roster.present));
  });

  app.post(
    '/api/games/:slug/presence',
    {
      config: {
        // Comfortably above the shell's cadence (one beat per 12s, so five a minute) and
        // far below anything a runaway loop would produce. The shell owns the timer, so
        // exceeding this means a modified client rather than a busy player.
        rateLimit: { max: 30, timeWindow: 60_000 },
      },
    },
    async (request, response) => {
      if (!request.user) {
        // The ordinary condition for a signed-out visitor, not an error path: they still
        // read the roster through GET, they simply are not in it.
        return response.status(401).send({ error: 'authentication required' });
      }
      if (request.user.tier === 'blocked') {
        return response.status(403).send({ error: 'account is blocked' });
      }
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) {
        return response.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
      }
      const body = BeatSchema.safeParse(request.body);
      if (!body.success) {
        return response.status(400).send({ error: 'invalid position' });
      }
      const grid = await gridFor(params.data.slug);
      if (!grid) return response.status(404).send({ error: 'presence not found' });

      const worldId = worldIdFor(params.data.slug);
      const roster = registry.beat(worldId, request.user.uid, grid, body.data ?? {});
      return response.send(reply(roster, true));
    },
  );

  app.delete('/api/games/:slug/presence', async (request, response) => {
    if (!request.user) return response.status(401).send({ error: 'authentication required' });
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return response.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    // No schema gate, matching the world delete: "take me out of the roster" must keep
    // working even for a game that has left the catalog since the player walked in, or
    // whose declaration stopped parsing while they were standing in it.
    registry.leave(worldIdFor(params.data.slug), request.user.uid);
    return response.send({ ok: true });
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ContentChecker } from '../platform/moderation.js';
import type { Store, WorldEntryRecord } from '../platform/store.js';
import {
  isValidWorldKey,
  MAX_WORLD_ENTRIES,
  validateWorldEntry,
  worldOwnerTag,
  type WorldSchema,
} from './world-schema.js';
import type { WorldSchemaSource } from './world-source.js';
import { logModerationRejection } from '../telemetry/moderation-metrics.js';

/**
 * Shared asynchronous worlds (docs/persistent-world-plan.md, phase P2).
 *
 * The same arrangement as saves, one step further out: the game cannot reach the
 * network — sandboxed iframe, no `allow-same-origin`, a CSP with no `connect-src` — so
 * its GameKit `commons` module postMessages the trusted shell, and the shell makes this
 * request. What is new is that the result is shown to **other people**, which changes
 * what these routes owe:
 *
 * - **Reads are public.** Being able to walk through what strangers built is most of
 *   why a world exists, and gating that behind a sign-in would make every world look
 *   empty to the visitor most likely to be deciding whether to care. Writes need an
 *   account; reads do not.
 * - **Every field is validated against the game's declared schema** before it is
 *   stored, and every text field goes through the same moderator as player feedback.
 *   A game cannot widen its own schema at runtime — the declaration comes from the
 *   games repo, which is human-reviewed.
 * - **First writer owns the key.** Nobody can edit or delete another player's entry.
 *   Enforced in a transaction in the store, because a check-then-write loses exactly
 *   the race it exists to prevent.
 * - **A per-player quota**, declared by the game and capped by the platform. It is the
 *   only thing standing between a cooperative world and one person paving all of it.
 *
 * What is deliberately absent is game logic. The server will believe a player who says
 * their plot holds a hundred apples. Worlds are for cooperative play; see the plan.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});
const KeyParamsSchema = ParamsSchema.extend({
  key: z.string().trim().min(1).max(64),
});
const EntrySchema = z.object({
  /** Checked against the world's declared field spec, not by zod — see world-schema.ts. */
  fields: z.record(z.string(), z.unknown()),
});

export interface WorldRoutesOptions {
  store: Store;
  /** Absent (no games repo configured) makes every slug answer 404, like votes. */
  worlds?: WorldSchemaSource | null;
  contentChecker: ContentChecker;
}

/**
 * Today a game has exactly one world and its id is the slug. The id is kept opaque
 * everywhere else so that per-creator, seasonal or instanced worlds are a new id rather
 * than a migration of every stored path.
 */
function worldIdFor(slug: string): string {
  return slug;
}

interface PublicWorldEntry {
  key: string;
  fields: Record<string, string | number | boolean>;
  mine: boolean;
  ownerTag: string;
  updatedAt: string;
}

/**
 * Strips an entry down to what a game may see.
 *
 * `ownerUid` never crosses this line. A game gets `mine` and a per-world hash, which is
 * enough to render "this row of plots belongs to one stranger" and not enough to learn
 * anything about who that stranger is.
 */
function toPublicEntry(entry: WorldEntryRecord, worldId: string, uid: string | undefined): PublicWorldEntry {
  return {
    key: entry.key,
    fields: entry.fields,
    mine: uid !== undefined && entry.ownerUid === uid,
    ownerTag: worldOwnerTag(entry.ownerUid, worldId),
    updatedAt: entry.updatedAt,
  };
}

export async function registerWorldRoutes(app: FastifyInstance, options: WorldRoutesOptions): Promise<void> {
  const { store, worlds, contentChecker } = options;

  // Lower than a save's. A world write is a deliberate player action — planting a
  // thing, leaving a note — not something a game loop emits, and the module coalesces
  // per key on a four-second timer. Anything above this rate is a bug or an attempt.
  const writeRateLimit = { max: 30, timeWindow: 60_000 };

  async function schemaFor(slug: string): Promise<WorldSchema | null> {
    return (await worlds?.getSchema(slug)) ?? null;
  }

  app.get('/api/games/:slug/world', async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    const schema = await schemaFor(params.data.slug);
    // No schema means no world: an unpublished game, one that declares none, or one
    // whose declaration did not parse. All three are "there is nothing here" from the
    // game's side, and the module treats it as unavailable and plays on.
    if (!schema) return reply.status(404).send({ error: 'world not found' });

    const worldId = worldIdFor(params.data.slug);
    const entries = await store.listWorldEntries(worldId);
    const uid = request.user?.uid;
    return reply.send({
      entries: entries.map((entry) => toPublicEntry(entry, worldId, uid)),
      maxPerPlayer: schema.maxPerPlayer,
      // Signed-out visitors read the world but cannot change it, and a blocked account
      // is told the same thing — reported plainly so a game can say "sign in to plant
      // something" rather than letting the player act into a void.
      writable: Boolean(request.user) && request.user?.tier !== 'blocked',
    });
  });

  app.put('/api/games/:slug/world/:key', { config: { rateLimit: writeRateLimit } }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    if (request.user.tier === 'blocked') {
      return reply.status(403).send({ error: 'account is blocked' });
    }
    const params = KeyParamsSchema.safeParse(request.params);
    if (!params.success || !isValidWorldKey(params.data.key)) {
      return reply.status(400).send({ error: 'invalid world key' });
    }
    const body = EntrySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const schema = await schemaFor(params.data.slug);
    if (!schema) return reply.status(404).send({ error: 'world not found' });

    const validated = validateWorldEntry(schema, body.data.fields);
    if (!validated.ok) return reply.status(400).send({ error: validated.error });

    // Moderation before storage, never after. An entry is visible to every other player
    // the moment it lands, so there is no window in which a rejected string is merely
    // "pending review" — it would already have been read.
    if (validated.texts.length > 0) {
      const verdict = await contentChecker.checkFields(validated.texts);
      if (!verdict.allowed) {
        logModerationRejection(request.log, {
          surface: 'world_text',
          uid: request.user?.uid,
          category: verdict.category,
        });
        // `?? 'other'` for the same reason the log line normalizes: `category` is optional
        // on the verdict, and JSON drops an undefined value rather than sending null — so a
        // checker that refused without classifying would produce a 422 with no category at
        // all, and the client's `errors.contentRejected.<category>` lookup would resolve to
        // nothing. Every other moderated route already normalized here; this one did not.
        return reply.status(422).send({ error: 'that text was rejected', category: verdict.category ?? 'other' });
      }
    }

    const result = await store.putWorldEntry({
      worldId: worldIdFor(params.data.slug),
      key: params.data.key,
      uid: request.user.uid,
      fields: validated.fields,
      maxPerPlayer: schema.maxPerPlayer,
      maxEntries: MAX_WORLD_ENTRIES,
    });
    if (!result.ok) {
      // 409 for a key somebody else holds, 403 for a limit this player has reached.
      // Distinguished because a game can act on them differently: the first means pick
      // another spot, the second means clear something away first.
      if (result.reason === 'conflict') {
        return reply.status(409).send({ error: 'that entry belongs to another player' });
      }
      if (result.reason === 'quota') {
        return reply.status(403).send({ error: `you already hold ${schema.maxPerPlayer} entries in this world` });
      }
      return reply.status(503).send({ error: 'this world is full' });
    }

    const worldId = worldIdFor(params.data.slug);
    return reply.send({ ok: true, entry: toPublicEntry(result.entry, worldId, request.user.uid) });
  });

  app.delete('/api/games/:slug/world/:key', { config: { rateLimit: writeRateLimit } }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const params = KeyParamsSchema.safeParse(request.params);
    if (!params.success || !isValidWorldKey(params.data.key)) {
      return reply.status(400).send({ error: 'invalid world key' });
    }
    // No schema gate here, matching the save route's delete. If a game leaves the
    // catalog its entries are still something a player wrote, and "take my thing back"
    // must keep working — a 404 would strand a row nobody can reach.
    const removed = await store.deleteWorldEntry(worldIdFor(params.data.slug), params.data.key, request.user.uid);
    if (!removed) {
      // Also the answer for an entry that belongs to somebody else: not found and not
      // yours are the same sentence, so the route cannot be used to probe what exists.
      return reply.status(404).send({ error: 'entry not found' });
    }
    return reply.send({ ok: true });
  });
}

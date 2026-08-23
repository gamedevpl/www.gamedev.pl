import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import { MAX_GAME_SAVE_BYTES, type Store } from '../store.js';

/**
 * Durable per-player game progress (docs/persistent-world-plan.md, phase P1).
 *
 * The game itself never reaches this route. A game runs in an iframe with
 * `sandbox="allow-scripts allow-pointer-lock"`, no `allow-same-origin`, and a CSP with no `connect-src` —
 * it could not call an API if it wanted to, which is the invariant the whole platform
 * rests on. What happens instead is the same shape as multiplayer input, in reverse:
 * the game asks its GameKit `save` module for a slot, the module postMessages the
 * trusted shell, and the shell — normal app code, on the real origin, holding the
 * session cookie — makes this request. Everything crossing that bridge is untrusted,
 * so `data` is treated as an opaque string here and is never parsed, indexed, or
 * interpolated into anything.
 *
 * Three deliberate limits:
 *
 * - **Signed in, or nothing is kept.** A save needs somebody to belong to. The module
 *   reports `unavailable` for signed-out play, and games are required (Check 21, and
 *   proved by every CI capture run) to stay fully playable in that state — so a 401
 *   here is a normal condition, not an error path.
 * - **Published games only**, gated the same way votes and play telemetry are. A draft
 *   is seen by its own creator during a build that may rewrite the save format on the
 *   next commit; letting it write real player progress would persist state whose
 *   meaning changes underneath it.
 * - **32 KB per save**, checked in bytes of exactly what gets stored. Games are steered
 *   toward level numbers and unlocks; anything that wants a world belongs to P2.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

const SaveSchema = z.object({
  /**
   * Opaque game-authored JSON. Validated as *parseable* but never used parsed: a blob
   * that is not JSON is a bug in the game or a forged bridge frame, and either way it
   * would come back out as a save the module cannot read. Rejecting it here turns a
   * silently corrupt slot into an error the author sees while developing.
   */
  data: z.string().min(1),
  version: z.number().int().min(0).max(1_000_000).optional(),
});

export interface GameSaveRoutesOptions {
  store: Store;
  /** Absent (no games repo configured) makes every slug answer 404, like votes. */
  publishedSlugs?: PublishedSlugGate | null;
}

export async function registerGameSaveRoutes(app: FastifyInstance, options: GameSaveRoutesOptions): Promise<void> {
  const { store, publishedSlugs } = options;

  // A save is written on a timer by the module (coalesced, one write per few seconds
  // per game), so the honest ceiling is well above a vote's but nowhere near a stream.
  // Generous enough that a player alt-tabbing between two games never sees a failure,
  // tight enough that a broken game cannot hammer Firestore from one browser.
  const writeRateLimit = { max: 60, timeWindow: 60_000 };

  async function isPublished(slug: string): Promise<boolean> {
    return (await publishedSlugs?.isPublished(slug)) ?? false;
  }

  app.get('/api/games/:slug/save', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }

    const record = await store.getGameSave(request.user.uid, params.data.slug);
    // A player with no save is the normal first-time case, not a 404: the answer to
    // "what is my progress" is "none yet", and the module turns that into a fresh game.
    return reply.send(
      record
        ? { data: record.data, version: record.version, updatedAt: record.updatedAt }
        : { data: null, version: 0, updatedAt: null },
    );
  });

  app.put('/api/games/:slug/save', { config: { rateLimit: writeRateLimit } }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    if (request.user.tier === 'blocked') {
      return reply.status(403).send({ error: 'account is blocked' });
    }
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    const body = SaveSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    // Bytes of UTF-8, because bytes are what gets stored — `length` would let a save
    // full of non-ASCII through at up to four times the budget.
    if (Buffer.byteLength(body.data.data, 'utf8') > MAX_GAME_SAVE_BYTES) {
      return reply.status(413).send({ error: 'save is too large' });
    }
    try {
      JSON.parse(body.data.data);
    } catch {
      return reply.status(400).send({ error: 'save data must be JSON' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }

    const record = await store.putGameSave(request.user.uid, params.data.slug, body.data.data, body.data.version ?? 1);
    return reply.send({ ok: true, version: record.version, updatedAt: record.updatedAt });
  });

  app.delete('/api/games/:slug/save', { config: { rateLimit: writeRateLimit } }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    // No published-slug gate on delete, unlike the read and the write. If a game leaves
    // the catalog, its saves are still the player's data and "delete my progress" must
    // keep working — a 404 here would strand a row nobody can reach.
    await store.deleteGameSave(request.user.uid, params.data.slug);
    return reply.send({ ok: true });
  });
}

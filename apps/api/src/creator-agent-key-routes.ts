/**
 * Studio routes for the creator-wide MCP opener key (BY-27a).
 *
 * Sits with OAuth grants under `/api/me/*` — both answer "what can reach my account".
 * UI copy never uses the word "token".
 */

import type { FastifyInstance } from 'fastify';
import {
  creatorAgentKeyFingerprint,
  maskCreatorAgentKeyHeader,
  mintCreatorAgentKey,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import { isActiveBuildRound } from './builder.js';
import type { CreatorAgentKeyRecord, Store } from './store.js';

export interface CreatorAgentKeyRoutesOptions {
  store: Store;
  submissionTokenSecret: string;
  now?: () => number;
}

function mintPayload(
  secret: string,
  ownerUid: string,
  keyGeneration: number,
  nowMs: number,
): {
  key: string;
  keyGeneration: number;
  expiresAt: number;
  fingerprint: string;
  authorizationHeader: string;
  authorizationHeaderMasked: string;
  revoked: false;
} {
  const key = mintCreatorAgentKey(secret, { creatorUid: ownerUid, keyGeneration, now: nowMs });
  const claims = verifyCreatorAgentKey(key, secret);
  return {
    key,
    keyGeneration: claims.keyGeneration,
    expiresAt: claims.exp,
    fingerprint: creatorAgentKeyFingerprint(key),
    authorizationHeader: `Authorization: Bearer ${key}`,
    authorizationHeaderMasked: maskCreatorAgentKeyHeader(key),
    revoked: false,
  };
}

/**
 * The instant a generation was minted — the anchor every mint of that generation uses.
 *
 * GET re-mints so the panel can offer "Copy header" without a second round trip, and
 * minting at `now()` made every visit produce a *different* key. The displayed "Ends in …"
 * tail therefore never matched the header the agent was actually holding, so a creator
 * checking whether their agent was current always saw a mismatch — and the remedy the
 * panel offers is Rotate, which is destructive. Anchoring to the generation's own
 * timestamp makes a generation mint to exactly one key: the tail is stable, it is the
 * tail of the key they pasted, and the stated expiry is the real one rather than a
 * deadline that slid forward on every page load.
 */
function generationAnchor(record: CreatorAgentKeyRecord, fallbackMs: number): number {
  const minted = Date.parse(record.updatedAt);
  return Number.isFinite(minted) ? minted : fallbackMs;
}

/**
 * Ends every agent session opened against this creator's still-open rounds.
 *
 * Bumping `keyGeneration` alone does not do what the Studio panel promises — "rotating
 * stops every agent still using the old key". A `sessionKey` minted before the rotation
 * authenticates on the *round's* generation and never consults the creator key at all, so
 * it kept full write access for the rest of its 24-hour life. CP-2 confirmed it against
 * production: `report_progress` succeeded after a rotation and the write landed in the
 * creator's thread.
 *
 * Advancing `roundGeneration` is what actually cuts those sessions off. It is the same
 * revocation the round-close path already performs, and `classifyAgentTokenAccess` already
 * rejects a stale generation on every tool call, so nothing new has to be trusted.
 *
 * Deliberately broader than the sentence promises: this also ends sessions opened with a
 * per-game key on those rounds. Rotation is a security action and should fail safe, and
 * the cost is recoverable — the agent calls `start` again for a fresh session.
 */
async function endOpenAgentSessions(store: Store, ownerUid: string): Promise<number> {
  const owned = await store.listSubmissionsByOwner(ownerUid);
  const open = owned.filter((job) => !job.abandonedAt && isActiveBuildRound(job));
  let ended = 0;
  for (const job of open) {
    if ((await store.bumpRoundGeneration(job.issueNumber)) !== null) ended += 1;
  }
  return ended;
}

export function registerCreatorAgentKeyRoutes(app: FastifyInstance, options: CreatorAgentKeyRoutesOptions): void {
  const { store, submissionTokenSecret } = options;
  const now = options.now ?? Date.now;

  /**
   * GET remints at the current generation (fresh exp) without rotating.
   * When no record exists yet, ensures generation 1. When revoked, returns status
   * only — does not resurrect a key (call POST to mint again).
   */
  app.get('/api/me/creator-agent-key', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const at = new Date(now()).toISOString();
    const existing = await store.getCreatorAgentKey(uid);
    if (existing?.revokedAt) {
      return reply.header('Cache-Control', 'no-store').send({
        keyGeneration: existing.keyGeneration,
        revoked: true,
      });
    }

    const record = existing ?? (await store.ensureCreatorAgentKey(uid, at));
    const payload = mintPayload(submissionTokenSecret, uid, record.keyGeneration, generationAnchor(record, now()));
    return reply.header('Cache-Control', 'no-store').send(payload);
  });

  /**
   * POST mints (first time or after revoke). Clears `revokedAt` without resetting
   * generation, so a leaked gen-1 key cannot come back after revoke.
   */
  app.post(
    '/api/me/creator-agent-key',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const uid = request.user?.uid;
      if (!uid) return reply.status(401).send({ error: 'unauthorized' });

      const at = new Date(now()).toISOString();
      const record = await store.reactivateCreatorAgentKey(uid, at);
      const payload = mintPayload(submissionTokenSecret, uid, record.keyGeneration, generationAnchor(record, now()));
      return reply.header('Cache-Control', 'no-store').send(payload);
    },
  );

  /** POST rotate bumps keyGeneration — any agent still holding the old key is cut off. */
  app.post(
    '/api/me/creator-agent-key/rotate',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const uid = request.user?.uid;
      if (!uid) return reply.status(401).send({ error: 'unauthorized' });

      const at = new Date(now()).toISOString();
      await store.ensureCreatorAgentKey(uid, at);
      const rotated = await store.rotateCreatorAgentKey(uid, at);
      if (!rotated) {
        return reply.status(500).send({ error: 'could not rotate creator key' });
      }
      const sessionsEnded = await endOpenAgentSessions(store, uid);
      const payload = mintPayload(submissionTokenSecret, uid, rotated.keyGeneration, generationAnchor(rotated, now()));
      return reply.header('Cache-Control', 'no-store').send({ ...payload, rotated: true, sessionsEnded });
    },
  );

  /**
   * DELETE revokes by bumping generation and setting revokedAt. The doc is kept so
   * generation never resets to 1 (a leaked gen-1 key must stay dead).
   */
  app.delete(
    '/api/me/creator-agent-key',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const uid = request.user?.uid;
      if (!uid) return reply.status(401).send({ error: 'unauthorized' });

      const existing = await store.getCreatorAgentKey(uid);
      if (!existing || existing.revokedAt) {
        return reply.status(404).send({ error: 'not_found' });
      }

      const at = new Date(now()).toISOString();
      const revoked = await store.revokeCreatorAgentKey(uid, at);
      if (!revoked) return reply.status(404).send({ error: 'not_found' });
      // Revoke is the stronger of the two controls, so it must at least do what rotate
      // does — a revoked key that leaves live sessions writing is not a revocation.
      await endOpenAgentSessions(store, uid);
      return reply.status(204).send();
    },
  );
}

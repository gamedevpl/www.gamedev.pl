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
import { endOpenAgentSessions } from './agent-session-revocation.js';
import type { CreatorAgentKeyRecord, Store } from '../store.js';

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
 * Mints this generation's key, re-dating the generation first if its anchor has aged
 * past the key TTL.
 *
 * Anchoring alone would hand back an already-expired key forever once a generation is
 * older than 90 days: the panel would still present it as active and offer it for
 * copying, every `start` would reject it, and the only remedy the panel offers is the
 * destructive Rotate. Re-dating keeps the generation — every key of it had already
 * expired, so nothing dead is resurrected — and the creator's pasted header keeps
 * working after one visit rather than needing a rotation they did not need.
 */
async function mintCurrentKey(
  store: Store,
  secret: string,
  ownerUid: string,
  record: CreatorAgentKeyRecord,
  nowMs: number,
): Promise<ReturnType<typeof mintPayload>> {
  const payload = mintPayload(secret, ownerUid, record.keyGeneration, generationAnchor(record, nowMs));
  if (payload.expiresAt * 1000 > nowMs) return payload;

  const refreshed = await store.touchCreatorAgentKey(ownerUid, new Date(nowMs).toISOString());
  if (!refreshed) return payload;
  return mintPayload(secret, ownerUid, refreshed.keyGeneration, generationAnchor(refreshed, nowMs));
}

/** Register creator-wide key lifecycle routes used by the Studio credentials panel. */
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
    const payload = await mintCurrentKey(store, submissionTokenSecret, uid, record, now());
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
      const payload = await mintCurrentKey(store, submissionTokenSecret, uid, record, now());
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
      if (!existing) return reply.status(404).send({ error: 'not_found' });

      const at = new Date(now()).toISOString();
      // Already revoked is not "nothing to do": if a previous attempt persisted the
      // revocation and then failed to end the sessions, returning 404 here would leave
      // those sessions writable forever, because no retry could ever reach the cleanup.
      // Ending sessions is idempotent — a generation bump on an already-dead round costs
      // nothing — so the retry finishes the job the first attempt started.
      if (!existing.revokedAt) {
        const revoked = await store.revokeCreatorAgentKey(uid, at);
        if (!revoked) return reply.status(404).send({ error: 'not_found' });
      }
      // Revoke is the stronger of the two controls, so it must at least do what rotate
      // does — a revoked key that leaves live sessions writing is not a revocation.
      await endOpenAgentSessions(store, uid);
      return reply.status(204).send();
    },
  );
}

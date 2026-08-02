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
import type { Store } from './store.js';

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
  };
}

export function registerCreatorAgentKeyRoutes(app: FastifyInstance, options: CreatorAgentKeyRoutesOptions): void {
  const { store, submissionTokenSecret } = options;
  const now = options.now ?? Date.now;

  /**
   * GET remints at the current generation (fresh exp) without rotating.
   * When no record exists yet, ensures generation 1.
   */
  app.get('/api/me/creator-agent-key', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const at = new Date(now()).toISOString();
    const record = await store.ensureCreatorAgentKey(uid, at);
    const payload = mintPayload(submissionTokenSecret, uid, record.keyGeneration, now());
    return reply.header('Cache-Control', 'no-store').send(payload);
  });

  /** POST bumps keyGeneration — any agent still holding the old key is cut off. */
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
      const payload = mintPayload(submissionTokenSecret, uid, rotated.keyGeneration, now());
      return reply.header('Cache-Control', 'no-store').send({ ...payload, rotated: true });
    },
  );

  /** DELETE revokes the key entirely. A later GET starts again at generation 1. */
  app.delete(
    '/api/me/creator-agent-key',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const uid = request.user?.uid;
      if (!uid) return reply.status(401).send({ error: 'unauthorized' });

      const revoked = await store.revokeCreatorAgentKey(uid);
      if (!revoked) return reply.status(404).send({ error: 'not_found' });
      return reply.status(204).send();
    },
  );
}

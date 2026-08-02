/**
 * Studio mint / rotate / revoke for durable creator-wide agent opener keys (BY-27a).
 *
 * Lives next to OAuth grants under `/api/me/…` — both answer "what can reach my account".
 * UI copy must never say "token".
 */

import type { FastifyInstance } from 'fastify';
import {
  assertCreatorAgentKeyActive,
  mintCreatorAgentKey,
  verifyCreatorAgentKey,
  type CreatorAgentKeyClaims,
} from './agent-creator-key.js';
import { InvalidAgentTokenError } from './agent-token.js';
import type { CreatorAgentKeyRecord, Store } from './store.js';

export interface CreatorAgentKeyRouteOptions {
  store: Store;
  /** Same secret MCP uses to verify openers (submission / agent channel secret). */
  agentTokenSecret: string;
  now?: () => number;
}

export type CreatorAgentKeyPayload = {
  key: string;
  keyGeneration: number;
  /** Unix seconds — identical to the key's signed exp. */
  expiresAt: number;
  revoked: false;
};

export type CreatorAgentKeyStatusPayload = {
  keyGeneration: number;
  revoked: boolean;
  /** Present when a key is active (not revoked); reminted at the current generation. */
  key?: string;
  expiresAt?: number;
};

function mintPayload(secret: string, record: CreatorAgentKeyRecord, nowMs: number): CreatorAgentKeyPayload {
  const key = mintCreatorAgentKey(secret, {
    creatorUid: record.ownerUid,
    keyGeneration: record.keyGeneration,
    now: nowMs,
  });
  const claims = verifyCreatorAgentKey(key, secret);
  return {
    key,
    keyGeneration: record.keyGeneration,
    expiresAt: claims.exp,
    revoked: false,
  };
}

/**
 * Signature, generation, expiry, and revocation — shared by MCP `start`.
 */
export async function verifyDurableCreatorAgentKey(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ ok: true; claims: CreatorAgentKeyClaims } | { ok: false; reason: string }> {
  let claims: CreatorAgentKeyClaims;
  try {
    claims = verifyCreatorAgentKey(key, secret);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: 'invalid creator key — mint a fresh key from Studio' };
    }
    throw error;
  }

  const record = await store.getCreatorAgentKey(claims.creatorUid);
  if (!record) {
    return { ok: false, reason: 'invalid creator key — mint a fresh key from Studio' };
  }

  try {
    assertCreatorAgentKeyActive(claims, record, nowMs);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: error.message || 'invalid creator key — mint a fresh key from Studio' };
    }
    throw error;
  }

  return { ok: true, claims };
}

export function registerCreatorAgentKeyRoutes(app: FastifyInstance, options: CreatorAgentKeyRouteOptions): void {
  const { store, agentTokenSecret } = options;
  const now = options.now ?? Date.now;

  app.get('/api/me/creator-agent-key', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const record = await store.getCreatorAgentKey(uid);
    if (!record) {
      return reply.header('cache-control', 'no-store').send({
        keyGeneration: 0,
        revoked: false,
      } satisfies CreatorAgentKeyStatusPayload);
    }

    if (record.revokedAt) {
      return reply.header('cache-control', 'no-store').send({
        keyGeneration: record.keyGeneration,
        revoked: true,
      } satisfies CreatorAgentKeyStatusPayload);
    }

    const minted = mintPayload(agentTokenSecret, record, now());
    return reply.header('cache-control', 'no-store').send({
      keyGeneration: minted.keyGeneration,
      revoked: false,
      key: minted.key,
      expiresAt: minted.expiresAt,
    } satisfies CreatorAgentKeyStatusPayload);
  });

  /** Mint (first time or after revoke). Does not bump generation when already active. */
  app.post('/api/me/creator-agent-key', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const at = new Date(now()).toISOString();
    const record = await store.ensureCreatorAgentKey(uid, at);
    const payload = mintPayload(agentTokenSecret, record, now());
    return reply.header('cache-control', 'no-store').send(payload);
  });

  /** Rotate: bump generation and return a fresh key. Stops any agent holding the old one. */
  app.post('/api/me/creator-agent-key/rotate', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const existing = await store.getCreatorAgentKey(uid);
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const at = new Date(now()).toISOString();
    const rotated = await store.rotateCreatorAgentKey(uid, at);
    if (!rotated) return reply.status(404).send({ error: 'not_found' });
    const payload = mintPayload(agentTokenSecret, rotated, now());
    return reply.header('cache-control', 'no-store').send(payload);
  });

  /** Revoke: bump generation, mark revoked, do not return a replacement. */
  app.delete('/api/me/creator-agent-key', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const existing = await store.getCreatorAgentKey(uid);
    if (!existing || existing.revokedAt) {
      return reply.status(404).send({ error: 'not_found' });
    }

    const at = new Date(now()).toISOString();
    const revoked = await store.revokeCreatorAgentKey(uid, at);
    if (!revoked) return reply.status(404).send({ error: 'not_found' });
    return reply.status(204).send();
  });
}

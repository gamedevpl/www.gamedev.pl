import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MAX_EXPIRY_DAYS,
  MintAccessTokenError,
  mintAccessTokenFor,
  toPublicAccessToken,
  type MintFailureReason,
} from './access-token-service.js';
import { isAdminSession } from './admin-session.js';
import type { Store } from './store.js';

/**
 * Issuing and revoking personal access tokens (docs/agent-access-tokens.md).
 *
 * Operator-only, and deliberately session-only: `isAdminSession` refuses a caller who is
 * themselves authenticated with a token, so a PAT can never mint another PAT. Without
 * that, one leaked credential becomes a self-renewing one and revoking the original
 * accomplishes nothing.
 *
 * There is no self-service surface yet — no "create a token" button in the app. Minting
 * is the one step that must involve a human at a browser, and keeping it here means the
 * whole feature ships without a new UI, a new secret, or a new unauthenticated route.
 * The rules themselves live in `access-token-service.ts`, shared with the `token:mint`
 * CLI so the two issuance paths cannot disagree.
 */

const MintSchema = z.object({
  uid: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9:_-]{2,63}$/i, 'invalid uid'),
  /** Free-text label so a list of tokens is still readable months later. */
  name: z.string().trim().min(1, 'name is required').max(60, 'name is too long'),
  expiresInDays: z.coerce.number().int().min(1).max(MAX_EXPIRY_DAYS).optional(),
});

const RevokeParamsSchema = z.object({
  tokenId: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{16}$/, 'invalid token id'),
});

const ListQuerySchema = z.object({
  uid: z.string().trim().min(1, 'uid is required'),
});

const FAILURE_STATUS: Record<MintFailureReason, number> = {
  unknown_uid: 400,
  blocked: 403,
  too_many_tokens: 409,
  invalid_expiry: 400,
};

export interface AccessTokenRoutesOptions {
  store: Store;
  adminUids?: Set<string>;
  now?: () => number;
}

export async function registerAccessTokenRoutes(
  app: FastifyInstance,
  options: AccessTokenRoutesOptions,
): Promise<void> {
  const { store, adminUids } = options;
  const now = options.now ?? Date.now;

  app.post('/api/admin/access-tokens', async (request, reply) => {
    // 404, not 403 — the same answer the telemetry views give a non-admin, for the same
    // reason: whether an operator surface exists is not a fact worth confirming.
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = MintSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const nowMs = now();
    try {
      const { token, record, accountCreated } = await mintAccessTokenFor(store, {
        ...parsed.data,
        createdByUid: request.user?.uid ?? 'unknown',
        nowMs,
      });

      // The only time the token itself is ever readable. Nothing stores it, so a caller
      // who loses it revokes and mints again rather than recovering it.
      return reply.status(201).send({ token, accountCreated, ...toPublicAccessToken(record, nowMs) });
    } catch (error) {
      if (error instanceof MintAccessTokenError) {
        return reply.status(FAILURE_STATUS[error.reason]).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/api/admin/access-tokens', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = ListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const records = await store.listAccessTokens(parsed.data.uid);
    const nowMs = now();
    return reply.status(200).send({ tokens: records.map((record) => toPublicAccessToken(record, nowMs)) });
  });

  app.delete('/api/admin/access-tokens/:tokenId', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = RevokeParamsSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid token id' });
    }

    // Revocation is a delete, not a flag: the record *is* the token's existence, so there
    // is no revoked-but-still-verifiable state to get wrong.
    const deleted = await store.deleteAccessToken(parsed.data.tokenId);
    if (!deleted) {
      return reply.status(404).send({ error: 'not found' });
    }

    return reply.status(200).send({ status: 'ok' });
  });
}

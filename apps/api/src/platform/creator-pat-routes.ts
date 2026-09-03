import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MAX_EXPIRY_DAYS,
  MintAccessTokenError,
  mintAccessTokenFor,
  toPublicAccessToken,
  type MintFailureReason,
} from './access-token-service.js';
import type { Store } from './store.js';

const MintSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(60, 'name is too long'),
  expiresInDays: z.coerce.number().int().min(1).max(MAX_EXPIRY_DAYS),
});

const RevokeParamsSchema = z.object({
  tokenId: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{16}$/, 'invalid token id'),
});

const FAILURE_STATUS: Record<MintFailureReason, number> = {
  unknown_uid: 400,
  blocked: 403,
  too_many_tokens: 409,
  invalid_expiry: 400,
};

export interface CreatorPatRoutesOptions {
  store: Store;
  now?: () => number;
}

function sessionOnly(request: { authMethod: string | null; user?: { uid: string } | null }): boolean {
  return request.authMethod === 'session' && Boolean(request.user?.uid);
}

export async function registerCreatorPatRoutes(app: FastifyInstance, options: CreatorPatRoutesOptions): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  app.post('/api/me/access-tokens', async (request, reply) => {
    if (!sessionOnly(request)) return reply.status(404).send({ error: 'not found' });
    const parsed = MintSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    const nowMs = now();
    try {
      const { token, record } = await mintAccessTokenFor(store, {
        uid: request.user!.uid,
        name: parsed.data.name,
        expiresInDays: parsed.data.expiresInDays,
        createdByUid: request.user!.uid,
        nowMs,
      });
      return reply.status(201).send({ token, ...toPublicAccessToken(record, nowMs) });
    } catch (error) {
      if (error instanceof MintAccessTokenError) {
        return reply.status(FAILURE_STATUS[error.reason]).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/api/me/access-tokens', async (request, reply) => {
    if (!sessionOnly(request)) return reply.status(404).send({ error: 'not found' });
    const nowMs = now();
    const records = await store.listAccessTokens(request.user!.uid);
    return reply.status(200).send({ tokens: records.map((record) => toPublicAccessToken(record, nowMs)) });
  });

  app.delete('/api/me/access-tokens/:tokenId', async (request, reply) => {
    if (!sessionOnly(request)) return reply.status(404).send({ error: 'not found' });
    const parsed = RevokeParamsSchema.safeParse(request.params ?? {});
    if (!parsed.success)
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid token id' });
    const held = await store.listAccessTokens(request.user!.uid);
    if (!held.some((record) => record.tokenId === parsed.data.tokenId)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const deleted = await store.deleteAccessToken(parsed.data.tokenId);
    if (!deleted) return reply.status(404).send({ error: 'not found' });
    return reply.status(200).send({ status: 'ok' });
  });
}

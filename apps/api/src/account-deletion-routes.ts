import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE_NAME } from './auth.js';
import { eraseAccount } from './erase-account.js';
import type { Store } from './store.js';

const DeleteAccountBody = z.object({
  confirmation: z.literal('DELETE'),
});

/** Self-service account deletion. Session-only: long-lived PATs may never erase a person. */
export function registerAccountDeletionRoutes(app: FastifyInstance, store: Store): void {
  app.delete('/api/me/account', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'authentication required' });
    if (request.authMethod !== 'session') return reply.status(403).send({ error: 'browser session required' });

    const body = DeleteAccountBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'confirmation required' });

    const result = await eraseAccount({ store, uid: request.user.uid });
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({
      deleted: true,
      publishedGamesKept: result.identity.publishedSlugs,
      unpublishedGamesRemoved: result.identity.unpublishedSlugs,
    });
  });
}

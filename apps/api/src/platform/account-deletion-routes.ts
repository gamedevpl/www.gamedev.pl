import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearSessionCookies } from './session-cookie.js';
import { runAccountDeletionSweep, scheduleAccountDeletion } from './account-deletion.js';
import { OperatorAccountDeletionError } from './erase-account.js';
import type { InternalAuthVerifier } from './internal-auth.js';
import type { Store } from './store.js';

const DeleteAccountBody = z.object({
  confirmation: z.literal('DELETE'),
});

export interface AccountDeletionRoutesOptions {
  store: Store;
  adminUids?: ReadonlySet<string>;
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
  graceMs?: number;
}

/** Self-service scheduling plus the OIDC-authenticated delayed cleanup sweep. */
export function registerAccountDeletionRoutes(app: FastifyInstance, options: AccountDeletionRoutesOptions): void {
  const { store, adminUids, internalAuthVerifier } = options;

  app.delete('/api/me/account', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'authentication required' });
    if (request.authMethod !== 'session') return reply.status(403).send({ error: 'browser session required' });

    const body = DeleteAccountBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'confirmation required' });

    let deletion;
    try {
      deletion = await scheduleAccountDeletion({
        store,
        uid: request.user.uid,
        adminUids,
        now: options.now,
        graceMs: options.graceMs,
      });
    } catch (error) {
      if (error instanceof OperatorAccountDeletionError) {
        return reply.status(409).send({ error: 'operator accounts must be demoted before deletion' });
      }
      throw error;
    }
    if (!deletion) return reply.status(404).send({ error: 'account not found' });

    clearSessionCookies(request, reply);
    return reply.status(202).send({ scheduled: true, deleteAfter: deletion.scheduledFor });
  });

  app.post(
    '/api/internal/account-deletion-sweep',
    { config: { rateLimit: { max: 24, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }

      const result = await runAccountDeletionSweep({ store, adminUids, now: options.now });
      for (const failure of result.failures) {
        request.log.error({ err: failure.error, uid: failure.uid }, 'account deletion sweep item failed');
      }
      if (result.operatorAccountsSkipped.length > 0) {
        request.log.error(
          { operatorUids: result.operatorAccountsSkipped },
          'account deletion sweep skipped operator accounts awaiting demotion',
        );
      }
      const payload = {
        scanned: result.scanned,
        deleted: result.deleted,
        failed: result.failures.length,
        operatorAccountsSkipped: result.operatorAccountsSkipped.length,
      };
      return result.failures.length > 0 ? reply.status(500).send(payload) : reply.send(payload);
    },
  );
}

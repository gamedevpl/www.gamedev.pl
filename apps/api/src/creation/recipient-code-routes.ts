import type { FastifyInstance } from 'fastify';
import type { Store } from '../platform/store.js';

// GO-02 groundwork: find/rotate one's own recipient code.

// No lookup-by-code route: nothing consumes one yet.

export interface RecipientCodeRoutesOptions {
  store: Store;
  now?: () => number;
}

export interface RecipientCodeResponse {
  code: string;
}

function requireUser(
  request: { user?: { uid: string; tier?: string } | null },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

export async function registerRecipientCodeRoutes(
  app: FastifyInstance,
  options: RecipientCodeRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  app.get(
    '/api/me/recipient-code',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const at = new Date(now()).toISOString();
      const code = await store.ensureRecipientCode(request.user!.uid, at);
      if (!code) return reply.status(404).send({ error: 'not_found' });
      const body: RecipientCodeResponse = { code };
      return reply.send(body);
    },
  );

  app.post(
    '/api/me/recipient-code/rotate',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const at = new Date(now()).toISOString();
      const code = await store.rotateRecipientCode(request.user!.uid, at);
      if (!code) return reply.status(404).send({ error: 'not_found' });
      const body: RecipientCodeResponse = { code };
      return reply.send(body);
    },
  );
}

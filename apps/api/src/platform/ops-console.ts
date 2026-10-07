// Door for the private ops console; see its README, "Server side".
import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import type { Store } from './store.js';

export const OPS_PREFIX = '/api/internal/ops';
export const OPERATOR_HEADER = 'x-operator-uid';

const ID = '[A-Za-z0-9_-]+';
// Only what needs server credentials; the console does the rest.
const OPS_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: new RegExp(`^/api/admin/jobs/${ID}/(publish|retry|cancel)$`) },
  { method: 'GET', path: new RegExp(`^/api/admin/jobs/${ID}/preview$`) },
  { method: 'POST', path: new RegExp(`^/api/admin/games/${ID}/(regate|delete)$`) },
  { method: 'GET', path: new RegExp(`^/api/admin/games/${ID}/remix$`) },
  { method: 'PUT', path: new RegExp(`^/api/admin/games/${ID}/remix$`) },
  { method: 'POST', path: /^\/api\/admin\/(slug|title|game-access)-backfill$/ },
  // Flag ids are `<slug>:<uid>`, sent percent-encoded.
  { method: 'POST', path: /^\/api\/admin\/moderation-flags\/[A-Za-z0-9_:%-]+\/resolve$/ },
  { method: 'POST', path: /^\/api\/admin\/review-sweeps$/ },
  { method: 'POST', path: new RegExp(`^/api/admin/review-sweeps/${ID}$`) },
  { method: 'POST', path: /^\/api\/admin\/review-requeue$/ },
  { method: 'GET', path: /^\/api\/admin\/proposals$/ },
  { method: 'GET', path: new RegExp(`^/api/proposals/${ID}(/diff)?$`) },
  { method: 'POST', path: new RegExp(`^/api/proposals/${ID}/(accept|decline|changes)$`) },
];

// Raw requests the rewrite admitted; a header could be forged, identity cannot.
const opsRequests = new WeakSet<IncomingMessage>();

export function isOpsRoute(method: string, url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  return OPS_ROUTES.some((route) => route.method === method && route.path.test(pathname));
}

// Fastify `rewriteUrl`: runs before routing, so the existing handlers answer.
export function rewriteOpsUrl(req: IncomingMessage): string {
  const url = req.url ?? '/';
  if (!url.startsWith(`${OPS_PREFIX}/`)) return url;
  const target = `/api${url.slice(OPS_PREFIX.length)}`;
  if (!isOpsRoute(req.method ?? 'GET', target)) return url;
  opsRequests.add(req);
  return target;
}

export interface OpsConsoleOptions {
  store: Store;
  adminUids: Set<string>;
  verifier: InternalAuthVerifier;
}

// Register after the auth plugin, so this identity replaces whatever it found.
export function registerOpsConsole(app: FastifyInstance, options: OpsConsoleOptions): void {
  app.decorateRequest('operatorDoor', false);
  app.addHook('onRequest', async (request, reply) => {
    if (!opsRequests.has(request.raw)) {
      // The browser console is gone; only the ops door reaches operator routes.
      if (request.url.startsWith('/api/admin/') || request.url === '/api/admin') {
        return reply.status(404).send({ error: 'not found' });
      }
      return;
    }
    const uid = request.headers[OPERATOR_HEADER];
    const admitted =
      typeof uid === 'string' &&
      options.adminUids.has(uid) &&
      (await options.verifier.verify(request.headers.authorization));
    const operator = admitted ? await options.store.getUser(uid) : null;
    if (!operator || operator.tier === 'blocked' || operator.deletionScheduledFor) {
      return reply.status(404).send({ error: 'not found' });
    }
    request.user = operator;
    request.authMethod = 'session';
    request.sessionTokenId = null;
    request.operatorDoor = true;
  });
}

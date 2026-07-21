import Fastify, { type FastifyInstance } from 'fastify';
import { BudgetExceededError, BudgetTracker } from './budget.js';
import { InvalidJobTokenError, verifyJobToken } from '@gamedevpl/job-auth';

/**
 * Sits between the agent container and the model API.
 *
 * The container holds a short-lived, job-scoped token and NO provider key; this
 * proxy holds the real key and injects it on the way out. That way a fully
 * subverted agent has no credential to steal — the worst it can do is spend its
 * own job's budget, which is capped and attributed.
 *
 * See docs/security-model.md (blocker B0).
 */

export interface BuildProxyOptions {
  /** The real provider key. Never leaves this process. */
  upstreamApiKey?: string;
  /** HMAC secret that job tokens are signed with. */
  tokenSecret?: string;
  upstreamBaseUrl?: string;
  maxRequestsPerJob?: number;
  logger?: boolean;
  /** Injected in tests so no real network call happens. */
  fetchImpl?: typeof fetch;
  budget?: BudgetTracker;
}

/** Hop-by-hop and auth headers we must not blindly forward upstream. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'authorization',
  'x-api-key',
]);

export async function buildProxy(options: BuildProxyOptions = {}): Promise<FastifyInstance> {
  const upstreamApiKey = options.upstreamApiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  const tokenSecret = options.tokenSecret ?? process.env.AUTH_PROXY_SECRET ?? '';
  const upstreamBaseUrl = (
    options.upstreamBaseUrl ??
    process.env.UPSTREAM_BASE_URL ??
    'https://api.anthropic.com'
  ).replace(/\/$/, '');
  const budget = options.budget ?? new BudgetTracker(options.maxRequestsPerJob ?? 100);
  const doFetch = options.fetchImpl ?? fetch;

  if (!tokenSecret) {
    throw new Error('auth-proxy requires AUTH_PROXY_SECRET — without it any token would be accepted.');
  }

  const app = Fastify({ logger: options.logger ?? false });

  // Bodies are forwarded verbatim; don't let Fastify parse or re-serialize them.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/health', async () => ({
    status: 'ok',
    upstreamConfigured: Boolean(upstreamApiKey),
  }));

  app.all('/v1/*', async (request, reply) => {
    // The agent authenticates with its job token in the usual key header, so the
    // CLI needs no special configuration beyond a base URL.
    const presented =
      (request.headers['x-api-key'] as string | undefined) ??
      (request.headers.authorization as string | undefined)?.replace(/^Bearer\s+/i, '') ??
      '';

    let jobId: string;
    try {
      ({ jobId } = verifyJobToken(presented, tokenSecret));
    } catch (error) {
      if (error instanceof InvalidJobTokenError) {
        request.log.warn({ reason: error.message }, 'rejected request with invalid job token');
        return reply.status(401).send({ error: 'invalid or expired job token' });
      }
      throw error;
    }

    try {
      budget.charge(jobId);
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        request.log.warn({ jobId }, 'job exceeded its budget');
        return reply.status(429).send({ error: error.message });
      }
      throw error;
    }

    if (!upstreamApiKey) {
      return reply.status(503).send({ error: 'auth-proxy has no upstream credential configured' });
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
      if (typeof value === 'string') headers.set(name, value);
    }
    // The real credential is attached here and only here.
    headers.set('x-api-key', upstreamApiKey);

    const url = `${upstreamBaseUrl}${request.url}`;
    let upstream: Response;
    try {
      upstream = await doFetch(url, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : (request.body as Buffer | undefined),
      });
    } catch (error) {
      request.log.error({ jobId, err: error }, 'upstream request failed');
      return reply.status(502).send({ error: 'upstream request failed' });
    }

    // Attribution without content: log who and how it went, never the prompt or
    // completion — those are user data and may be sensitive.
    request.log.info({ jobId, path: request.url, status: upstream.status }, 'proxied upstream request');

    const body = Buffer.from(await upstream.arrayBuffer());
    reply.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!['content-length', 'content-encoding', 'transfer-encoding'].includes(name.toLowerCase())) {
        reply.header(name, value);
      }
    });
    return reply.send(body);
  });

  return app;
}

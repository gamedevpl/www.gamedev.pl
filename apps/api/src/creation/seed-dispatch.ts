import type { FastifyInstance } from 'fastify';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';

// Round-0 seeding as a request the service makes to itself.

// Outside a request Cloud Run grants CPU only when always-on.

// The route holds its response open; the seed runs in-request.

// Only a job id crosses; the brief comes from the store.

// Unconfigured or refused, create-game seeds inline as before.

export interface SeedDispatchClient {
  // True once the callee has started; false means dispatch inline.
  enqueue(jobId: number): Promise<boolean>;
}

export interface SeedDispatchClientOptions {
  audience: string;
  authTokenFor?: (audience: string) => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  // Wait for headers only -- a cold start, not the seed.
  timeoutMs?: number;
  log?: { warn: (context: object, message: string) => void };
}

async function defaultAuthToken(audience: string): Promise<string | undefined> {
  try {
    const client = await new GoogleAuth().getIdTokenClient(audience);
    const headers: unknown = await client.getRequestHeaders();
    const header =
      headers instanceof Headers
        ? headers.get('authorization')
        : (headers as Record<string, string> | undefined)?.authorization;
    return header?.replace(/^Bearer\s+/i, '') ?? undefined;
  } catch {
    return undefined;
  }
}

export function createSeedDispatchClient(options: SeedDispatchClientOptions): SeedDispatchClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authTokenFor = options.authTokenFor ?? defaultAuthToken;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    async enqueue(jobId) {
      const token = await authTokenFor(options.audience);
      if (!token) {
        options.log?.warn({ jobId }, 'seed handoff: no identity token, dispatching inline');
        return false;
      }
      // Timer covers the headers only; the body may take minutes.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetchImpl(options.audience, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ jobId }),
          signal: abort.signal,
        });
        clearTimeout(timer);
        if (response.status !== 202) {
          options.log?.warn({ jobId, status: response.status }, 'seed handoff refused, dispatching inline');
          return false;
        }
        // Drained rather than cancelled: cancelling would close the callee's request early.
        void response.text().catch(() => undefined);
        return true;
      } catch (error) {
        clearTimeout(timer);
        options.log?.warn({ jobId, err: error }, 'seed handoff failed, dispatching inline');
        return false;
      }
    },
  };
}

export function createSeedDispatchClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  log?: SeedDispatchClientOptions['log'],
): SeedDispatchClient | null {
  const audience = env.SEED_DISPATCH_AUDIENCE?.trim();
  return audience ? createSeedDispatchClient({ audience, log }) : null;
}

export type DispatchQueuedJob = (input: {
  jobId: number;
  log: { error: (context: object, message: string) => void };
}) => Promise<{ outcome: 'dispatched' | 'skipped'; reason?: string }>;

export interface SeedDispatchRouteOptions {
  dispatchQueuedJob: DispatchQueuedJob;
  internalAuthVerifier: InternalAuthVerifier;
}

const BodySchema = z.object({ jobId: z.number().int().positive() });

export async function registerSeedDispatchRoute(app: FastifyInstance, options: SeedDispatchRouteOptions): Promise<void> {
  app.post(
    '/api/internal/seed',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await options.internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      const body = BodySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid job id' });
      const { jobId } = body.data;

      // Headers now, body later: the caller lets go, this request keeps CPU.
      reply.hijack();
      reply.raw.writeHead(202, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      reply.raw.write(' ');
      try {
        const result = await options.dispatchQueuedJob({ jobId, log: request.log });
        request.log.info({ jobId, ...result }, 'seed dispatch complete');
        reply.raw.end(JSON.stringify(result));
      } catch (error) {
        request.log.error({ err: error, jobId }, 'seed dispatch failed');
        reply.raw.end(JSON.stringify({ outcome: 'failed' }));
      }
    },
  );
}

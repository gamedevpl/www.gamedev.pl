// Nightly scheduler endpoint that prunes old managed agent sessions.

import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';
import { createAnthropicSessionJanitor, type ManagedSessionJanitor } from './managed-session-retention.js';

export const DEFAULT_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 7;
export const MAX_DELETES_PER_RUN = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ManagedSessionRetentionRoutesOptions {
  janitor: ManagedSessionJanitor | null;
  internalAuthVerifier: InternalAuthVerifier;
  retentionDays: number;
  maxDeletes: number;
  now?: () => number;
}

export function parseRetentionDays(raw: string | undefined): number {
  const trimmed = raw?.trim() ?? '';
  if (!/^\d+$/.test(trimmed)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Number.parseInt(trimmed, 10));
}

export function createManagedSessionRetentionFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<ManagedSessionRetentionRoutesOptions, 'janitor' | 'retentionDays' | 'maxDeletes'> {
  const apiKey = env.MANAGED_AGENT_API_KEY?.trim();
  const agentId = env.MANAGED_AGENT_ID?.trim();
  const baseUrl = env.MANAGED_AGENT_BASE_URL?.trim();
  const janitor =
    apiKey && agentId ? createAnthropicSessionJanitor({ apiKey, agentId, ...(baseUrl ? { baseUrl } : {}) }) : null;
  return {
    janitor,
    retentionDays: parseRetentionDays(env.MANAGED_SESSION_RETENTION_DAYS),
    maxDeletes: MAX_DELETES_PER_RUN,
  };
}

export async function registerManagedSessionRetentionRoutes(
  app: FastifyInstance,
  options: ManagedSessionRetentionRoutesOptions,
): Promise<void> {
  app.post(
    '/api/internal/managed-session-retention',
    { config: { rateLimit: { max: 24, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await options.internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      if (!options.janitor) return reply.send({ skipped: 'unconfigured' });
      // Never below the floor, even if an override passes less.
      const days = Math.max(MIN_RETENTION_DAYS, options.retentionDays);
      const olderThan = new Date((options.now ?? Date.now)() - days * DAY_MS);
      try {
        const result = await options.janitor.prune({ olderThan, maxDeletes: options.maxDeletes });
        const log = result.failed > 0 ? request.log.warn.bind(request.log) : request.log.info.bind(request.log);
        log({ ...result, retentionDays: days }, 'managed session retention complete');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'managed session retention failed');
        return reply.status(500).send({ error: 'managed session retention failed' });
      }
    },
  );
}

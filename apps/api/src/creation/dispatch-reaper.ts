// Retries a job whose dispatch died before recording a session.

import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';
import { DEFAULT_STALL_THRESHOLDS } from './job-state.js';
import type { Store } from '../platform/store.js';

export interface RedispatchOutcome {
  outcome: 'retried' | 'exhausted' | 'skipped';
  reason?: string;
}

export type RedispatchQueuedJob = (input: {
  issueNumber: number;
  log: { error: (context: object, message: string) => void };
}) => Promise<RedispatchOutcome>;

export interface DispatchReaperSweepDeps {
  store: Store;
  redispatchQueuedJob: RedispatchQueuedJob;
  now?: () => number;
  thresholdMs?: number;
  log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
}

export interface DispatchReaperSweepResult {
  checked: number;
  retried: number;
  exhausted: number;
  skipped: number;
}

export async function runDispatchReaperSweep(deps: DispatchReaperSweepDeps): Promise<DispatchReaperSweepResult> {
  const now = deps.now ?? Date.now;
  const thresholdMs = deps.thresholdMs ?? DEFAULT_STALL_THRESHOLDS.notDispatchedMs;
  const queued = await deps.store.listQueuedSubmissions();

  let retried = 0;
  let exhausted = 0;
  let skipped = 0;

  for (const record of queued) {
    const since = Date.parse(record.stateSince ?? record.createdAt);
    if (!Number.isFinite(since) || now() - since < thresholdMs) {
      skipped++;
      continue;
    }
    try {
      const result = await deps.redispatchQueuedJob({ issueNumber: record.issueNumber, log: deps.log });
      if (result.outcome === 'retried') retried++;
      else if (result.outcome === 'exhausted') exhausted++;
      else skipped++;
    } catch (error) {
      deps.log.error({ err: error, issueNumber: record.issueNumber }, 'dispatch reaper attempt failed');
      skipped++;
    }
  }

  return { checked: queued.length, retried, exhausted, skipped };
}

export interface DispatchReaperRoutesOptions {
  store: Store;
  redispatchQueuedJob: RedispatchQueuedJob;
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
  thresholdMs?: number;
}

export async function registerDispatchReaperRoutes(
  app: FastifyInstance,
  options: DispatchReaperRoutesOptions,
): Promise<void> {
  app.post(
    '/api/internal/dispatch-reaper',
    { config: { rateLimit: { max: 24, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await options.internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      try {
        const result = await runDispatchReaperSweep({
          store: options.store,
          redispatchQueuedJob: options.redispatchQueuedJob,
          now: options.now,
          thresholdMs: options.thresholdMs,
          log: request.log,
        });
        const log = result.exhausted > 0 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
        log(result, 'dispatch reaper sweep complete');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'dispatch reaper sweep failed');
        return reply.status(500).send({ error: 'dispatch reaper sweep failed' });
      }
    },
  );
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { beginReadTally, currentReadTally, installReadMeter, topReadPaths } from '../store/read-meter.js';

function routeOf(request: FastifyRequest): string {
  const routed = (request as FastifyRequest & { routeOptions?: { url?: string } }).routeOptions?.url;
  return routed ?? request.url.split('?')[0];
}

export function registerReadMeterLog(app: FastifyInstance): void {
  installReadMeter();

  app.addHook('onRequest', async () => {
    beginReadTally();
  });

  app.addHook('onResponse', async (request) => {
    const tally = currentReadTally();
    if (!tally || tally.reads + tally.missing + tally.commits === 0) return;
    request.log.info(
      {
        route: routeOf(request),
        fsReads: tally.reads,
        fsMissing: tally.missing,
        fsCalls: tally.calls,
        fsCommits: tally.commits,
        fsTransactions: tally.transactions,
        fsPaths: topReadPaths(tally),
      },
      'firestore reads',
    );
  });
}

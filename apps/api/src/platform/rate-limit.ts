// Rate-limit middleware. Imported under the legacy package name `fastify-rate-limit`
// (aliased to `@fastify/rate-limit` in package.json) so CodeQL's Fastify model
// recognizes it for js/missing-rate-limiting. Routes opt in via the `config.rateLimit`
// options object; in-handler sliding-window checks remain for domain-specific keys.

import rateLimit from 'fastify-rate-limit';
import type { FastifyInstance } from 'fastify';

/** Opt-in only — annotate handlers with `{ config: { rateLimit: … } }`. */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
    // Keyed by uid when signed in; clientIp is the edge.
    keyGenerator: (request) => request.user?.uid ?? request.clientIp,
  });
}

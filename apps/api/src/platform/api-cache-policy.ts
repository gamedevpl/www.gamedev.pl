import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// The edge caches only what says `public`; make the default ours.
export const API_DEFAULT_CACHE_CONTROL = 'private, no-store';

// Same bytes for everybody, so a cache may share these.
const SHARED_READS = /^\/api\/(?:catalog|featured)(?:\?|$)/;

// Origin work for these then scales with time rather than with traffic.
export const SHARED_READ_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

// Decided early so onSend can stay synchronous.
const shareableRequests = new WeakSet<FastifyRequest>();

export interface ApiCachePolicyOptions {
  // Whether the site is open to visitors; absent means share nothing.
  isOpenToVisitors?: () => Promise<boolean>;
}

// Routes that opt in keep their header; media does.
export function registerApiCachePolicy(app: FastifyInstance, options: ApiCachePolicyOptions = {}): void {
  const { isOpenToVisitors } = options;

  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.method !== 'GET' || !SHARED_READS.test(request.url)) return;
    if (isOpenToVisitors === undefined || !(await isOpenToVisitors())) return;
    shareableRequests.add(request);
  });

  app.addHook('onSend', (request, reply: FastifyReply, payload, done) => {
    if (!request.url.startsWith('/api/') || reply.hasHeader('cache-control')) return done(null, payload);
    // Only a good answer is shareable; a cached 503 outlives the outage.
    const shareable = reply.statusCode === 200 && shareableRequests.has(request);
    reply.header('cache-control', shareable ? SHARED_READ_CACHE_CONTROL : API_DEFAULT_CACHE_CONTROL);
    return done(null, payload);
  });
}

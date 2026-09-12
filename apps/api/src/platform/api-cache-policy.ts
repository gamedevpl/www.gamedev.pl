import type { FastifyInstance } from 'fastify';

// The edge caches only what says `public`; make the default ours.
export const API_DEFAULT_CACHE_CONTROL = 'private, no-store';

// Same bytes for everybody, so a cache may share these.
const SHARED_READS = /^\/api\/(?:catalog|featured)(?:\?|$)/;

// Origin work for these then scales with time rather than with traffic.
export const SHARED_READ_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

export interface ApiCachePolicyOptions {
  // Whether the site is open to visitors; absent means share nothing.
  isOpenToVisitors?: () => Promise<boolean>;
}

// Routes that opt in keep their header; media does.
export function registerApiCachePolicy(app: FastifyInstance, options: ApiCachePolicyOptions = {}): void {
  const { isOpenToVisitors } = options;

  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/api/')) return payload;
    if (reply.hasHeader('cache-control')) return payload;

    // Only a good answer is shareable; a cached 503 outlives the outage.
    const shareable =
      reply.statusCode === 200 &&
      request.method === 'GET' &&
      SHARED_READS.test(request.url) &&
      isOpenToVisitors !== undefined &&
      (await isOpenToVisitors());

    reply.header('cache-control', shareable ? SHARED_READ_CACHE_CONTROL : API_DEFAULT_CACHE_CONTROL);
    return payload;
  });
}

import type { FastifyInstance } from 'fastify';

// The edge caches only what says `public`; make the default ours.
export const API_DEFAULT_CACHE_CONTROL = 'private, no-store';

// Routes that opt in keep their header; media does.
export function registerApiCachePolicy(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/api/')) return payload;
    if (reply.hasHeader('cache-control')) return payload;
    reply.header('cache-control', API_DEFAULT_CACHE_CONTROL);
    return payload;
  });
}

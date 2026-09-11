import type { FastifyInstance } from 'fastify';

// Cloud Run domain mappings cannot 301 apex to www; we do.
export function registerCanonicalHostRedirect(app: FastifyInstance, canonicalHostRaw: string | undefined): void {
  const canonicalHost = canonicalHostRaw?.trim();
  const apexHost = canonicalHost?.startsWith('www.') ? canonicalHost.slice(4) : undefined;
  if (!canonicalHost || !apexHost) return;
  // Only the exact apex: run.app, localhost and www itself stay untouched.
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.host === apexHost) {
      return reply.redirect(`https://${canonicalHost}${request.url}`, 301);
    }
  });
}

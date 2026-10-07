import type { FastifyInstance } from 'fastify';
import { GAME_NOT_FOUND, GAME_WALLED, type SharePreview } from './share-meta.js';
import { isKnownSpaShellPath, looksLikeStaticAsset } from './spa-paths.js';

type PreviewShell = (request: { url: string }) => Promise<SharePreview>;

// Deep links boot with 200; unknown paths and missing games, 404.
export function registerSpaShellFallback(app: FastifyInstance, previewShell: PreviewShell): void {
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'not found' });
    }
    if (looksLikeStaticAsset(request.url)) {
      return reply.status(404).send({ error: 'not found' });
    }
    if (!isKnownSpaShellPath(request.url)) {
      return reply.status(404).type('text/html').sendFile('index.html');
    }
    const preview = await previewShell(request);
    // The SPA still boots its not-found panel; only the status differs.
    if (preview === GAME_NOT_FOUND) {
      return reply.status(404).type('text/html').sendFile('index.html');
    }
    if (preview === GAME_WALLED) {
      return reply.status(200).type('text/html').header('x-robots-tag', 'noindex').sendFile('index.html');
    }
    if (preview) {
      return reply.status(200).type('text/html').header('cache-control', 'no-cache').send(preview);
    }
    return reply.status(200).type('text/html').sendFile('index.html');
  });
}

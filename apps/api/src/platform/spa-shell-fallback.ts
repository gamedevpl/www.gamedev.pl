import type { FastifyInstance } from 'fastify';
import { CREATOR_NOT_FOUND, createCreatorShellStatus } from './creator-shell-status.js';
import { GAME_NOT_FOUND, GAME_WALLED, createSharePreviewShell, type SharePreviewShellOptions } from './share-meta.js';
import { isPrivateWorkspacePath } from './spa-path-kinds.js';
import { isKnownSpaShellPath, looksLikeStaticAsset } from './spa-paths.js';

// Deep links boot with 200; unknown paths, missing games and creators, 404.
export function registerSpaShellFallback(app: FastifyInstance, options: SharePreviewShellOptions): void {
  const previewShell = createSharePreviewShell(options);
  const { store } = options;
  const creatorStatus = store ? createCreatorShellStatus(store) : async () => null;
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
    if (isPrivateWorkspacePath(request.url)) {
      return reply.status(200).type('text/html').header('x-robots-tag', 'noindex').sendFile('index.html');
    }
    // The SPA still boots its not-found panel; only the status differs.
    if ((await creatorStatus(request)) === CREATOR_NOT_FOUND) {
      return reply.status(404).type('text/html').sendFile('index.html');
    }
    const preview = await previewShell(request);
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

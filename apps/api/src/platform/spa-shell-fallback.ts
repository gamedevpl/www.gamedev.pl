import type { FastifyInstance } from 'fastify';
import { isKnownSpaShellPath, looksLikeStaticAsset } from './spa-paths.js';

type PreviewShell = (request: { url: string }) => Promise<string | null>;

// Deep links boot with 200, unknown paths with a real 404.
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
    if (preview) {
      return reply.status(200).type('text/html').header('cache-control', 'no-cache').send(preview);
    }
    return reply.status(200).type('text/html').sendFile('index.html');
  });
}

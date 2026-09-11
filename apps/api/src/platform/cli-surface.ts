import type { FastifyInstance } from 'fastify';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { CLI_VERSION, installPs1, installSh } from './cli-installers.js';
import { cliPageHtml } from './cli-page.js';

export function cliSurfaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLI_SURFACE === 'true';
}

export const CLI_INSTALLER_PATHS = ['/install.sh', '/install.ps1'] as const;

function notFound(reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  return reply.status(404).send({ error: 'not found' });
}

export async function registerCliSurfaceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/install.sh', async (_request, reply) => {
    if (!cliSurfaceEnabled()) return notFound(reply);
    return reply
      .type('text/x-shellscript; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(installSh(canonicalAppBaseUrl()));
  });
  app.get('/install.ps1', async (_request, reply) => {
    if (!cliSurfaceEnabled()) return notFound(reply);
    return reply
      .type('text/plain; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(installPs1(canonicalAppBaseUrl()));
  });
  app.get('/cli', async (_request, reply) => {
    if (!cliSurfaceEnabled()) return notFound(reply);
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(cliPageHtml(canonicalAppBaseUrl()));
  });
  app.get('/api/cli/enabled', async (_request, reply) => {
    if (!cliSurfaceEnabled()) return notFound(reply);
    return reply.send({ enabled: true, version: CLI_VERSION });
  });
}

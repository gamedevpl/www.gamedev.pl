import type { FastifyInstance } from 'fastify';

// Off unless CLI_SURFACE is the literal string true.
export function cliSurfaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLI_SURFACE === 'true';
}

export const CLI_INSTALLER_PATHS = ['/install.sh', '/install.ps1'] as const;

export async function registerCliSurfaceRoutes(app: FastifyInstance): Promise<void> {
  for (const path of CLI_INSTALLER_PATHS) {
    app.get(path, async (_request, reply) => reply.status(404).send({ error: 'not found' }));
  }
}

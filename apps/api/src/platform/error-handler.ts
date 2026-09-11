import type { FastifyInstance, FastifyError } from 'fastify';
import { StorageWriteBusyError } from '../delivery/storage-write-retry.js';

export function registerErrorHandler(app: FastifyInstance): void {
  // Fastify's default 500 echoes err.message; 4xx replies pass through.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof StorageWriteBusyError) {
      void reply.header('Retry-After', '5').code(503).send({ error: 'storage_busy', message: error.message });
      return;
    }
    // Fastify reads both; statusCode wins when an error carries each.
    const statusCode = error.statusCode ?? (error as { status?: number }).status ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      void reply.send(error);
      return;
    }
    request.log.error({ err: error, method: request.method, url: request.url }, 'unhandled route error');
    void reply.code(500).send({ error: 'internal' });
  });
}

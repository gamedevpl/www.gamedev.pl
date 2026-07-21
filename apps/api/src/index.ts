import Fastify from 'fastify';

export function buildServer() {
  const fastify = Fastify({ logger: true });

  fastify.get('/api/version', async () => {
    return { name: 'gamedev-pl', version: '0.0.0' };
  });

  return fastify;
}

if (process.argv[1] === import.meta.filename) {
  const fastify = buildServer();

  fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}

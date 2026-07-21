import { buildProxy } from './app.js';

const port = Number(process.env.PORT ?? 3002);
const host = process.env.HOST ?? '127.0.0.1';

const app = await buildProxy({ logger: true });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

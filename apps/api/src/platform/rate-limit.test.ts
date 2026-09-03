import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerClientAddress } from './client-address.js';
import { registerRateLimit } from './rate-limit.js';

afterEach(() => {
  delete process.env.TRUST_EDGE_CLIENT_IP;
});

async function appWithCappedRoute() {
  const app = Fastify({ trustProxy: 1 });
  registerClientAddress(app);
  await registerRateLimit(app);
  app.get('/capped', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async () => ({ ok: true }));
  return app;
}

function get(app: Awaited<ReturnType<typeof appWithCappedRoute>>, edgeIp: string) {
  return app.inject({ method: 'GET', url: '/capped', headers: { 'fastly-client-ip': edgeIp } });
}

describe('the plugin limiter keys on the same address as the rest of the app', () => {
  it('gives each caller its own bucket behind the edge', async () => {
    process.env.TRUST_EDGE_CLIENT_IP = 'true';
    const app = await appWithCappedRoute();

    expect((await get(app, '203.0.113.7')).statusCode).toBe(200);
    expect((await get(app, '203.0.113.7')).statusCode).toBe(200);
    expect((await get(app, '203.0.113.7')).statusCode).toBe(429);
    // Keyed on request.ip this would share the exhausted bucket.
    expect((await get(app, '198.51.100.2')).statusCode).toBe(200);

    await app.close();
  });

  it('still shares one bucket per caller when the edge is not trusted', async () => {
    const app = await appWithCappedRoute();

    expect((await get(app, '203.0.113.7')).statusCode).toBe(200);
    expect((await get(app, '203.0.113.7')).statusCode).toBe(200);
    // One socket, edge header ignored, so one shared bucket.
    expect((await get(app, '198.51.100.2')).statusCode).toBe(429);

    await app.close();
  });
});

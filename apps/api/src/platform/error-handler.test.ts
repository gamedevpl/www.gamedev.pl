import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';

// A throw carries whatever the failing call put in its message.

const LEAK = 'GAMES_STORE_BUCKET=gamedev-private-bucket /srv/secrets/key.json';

async function appWithThrowingRoute(logLines?: string[]) {
  const app = await buildApp({
    store: new InMemoryStore(),
    sessionSecret: 'dev-session-secret-change-me',
    ...(logLines
      ? {
          logger: {
            level: 'error',
            stream: {
              write(line: string) {
                logLines.push(line);
              },
            },
          },
        }
      : {}),
  });

  // Registered after build, so it inherits the root error handler.
  app.get('/api/test-throw', async () => {
    throw new Error(LEAK);
  });

  app.get('/api/test-throw-status', async () => {
    const error = new Error(LEAK) as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  });

  app.get('/api/test-throw-redirect', async () => {
    const error = new Error(LEAK) as Error & { statusCode?: number };
    error.statusCode = 302;
    throw error;
  });

  await app.ready();
  return app;
}

describe('app-wide error handler', () => {
  it('answers an uncaught throw with a code, never the message', async () => {
    const app = await appWithThrowingRoute();
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });
    expect(response.body).not.toContain('gamedev-private-bucket');
    expect(response.body).not.toContain('/srv/secrets');

    await app.close();
  });

  it('flattens a thrown 5xx that carries its own status', async () => {
    const app = await appWithThrowingRoute();
    const response = await app.inject({ method: 'GET', url: '/api/test-throw-status' });

    // A 503 the route did not send itself is still internal.
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });

    await app.close();
  });

  it('flattens a thrown status outside 4xx rather than passing it through', async () => {
    const app = await appWithThrowingRoute();
    const response = await app.inject({ method: 'GET', url: '/api/test-throw-redirect' });

    // Only a real 4xx is an answer; anything else is failure.
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });
    expect(response.body).not.toContain('gamedev-private-bucket');

    await app.close();
  });

  it('logs the real error so the failure is not lost with the message', async () => {
    const logLines: string[] = [];
    const app = await appWithThrowingRoute(logLines);
    await app.inject({ method: 'GET', url: '/api/test-throw' });

    const logged = logLines.join('\n');
    expect(logged).toContain('unhandled route error');
    expect(logged).toContain('gamedev-private-bucket');

    await app.close();
  });

  it('leaves a route 4xx untouched', async () => {
    const app = await appWithThrowingRoute();

    // The operator console answers its own 401; do not reshape it.
    const response = await app.inject({ method: 'GET', url: '/api/admin/submissions' });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(response.json()).not.toEqual({ error: 'internal' });

    await app.close();
  });

  it('leaves Fastify validation 400s in their default shape', async () => {
    const app = await appWithThrowingRoute();
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: '{oops',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });

    await app.close();
  });
});

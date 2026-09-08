import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { registerAuthPlugin } from './auth.js';
import { InMemoryStore } from './store.js';

const originalEnv = process.env.NODE_ENV;
const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

// The fallback secret is public; in production it would sign forgeable sessions.
describe('SESSION_SECRET in production', () => {
  it('refuses to build the app without one', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    await expect(buildApp({ store: new InMemoryStore() })).rejects.toThrow(/SESSION_SECRET is required/);
  });

  it('refuses to register the auth plugin without one', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    const app = Fastify();
    await expect(registerAuthPlugin(app, { store: new InMemoryStore() })).rejects.toThrow(/SESSION_SECRET is required/);
    await app.close();
  });

  it('still starts outside production, where the dev fallback is the point', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SESSION_SECRET;
    const app = await buildApp({ store: new InMemoryStore() });
    await app.close();
  });
});

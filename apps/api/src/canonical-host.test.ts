import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { InMemoryStore } from './platform/store.js';

// Apex → www canonicalization. Cloud Run domain mappings can't 301, so the app
// does it: with CANONICAL_HOST=www.gamedev.pl set, a request to the bare apex
// (gamedev.pl) 301s to https://www.gamedev.pl + same path, while the canonical
// host, the run.app URL, and localhost are left alone (probes/smoke/dev unbroken).
describe('canonical apex → www redirect', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    if (app) await app.close();
    app = undefined;
  });

  async function build() {
    return buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
  }

  it('301-redirects the bare apex host to the canonical www host, preserving the path', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/some/path?q=1', headers: { host: 'gamedev.pl' } });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('https://www.gamedev.pl/some/path?q=1');
  });

  it('does not redirect requests already on the canonical host', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'www.gamedev.pl' } });
    expect(res.statusCode).toBe(200);
  });

  it('does not redirect the run.app host or other hosts', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'gamedev-app-334141807880.europe-west1.run.app' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('is a no-op when CANONICAL_HOST is unset (dev/tests)', async () => {
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'gamedev.pl' } });
    expect(res.statusCode).toBe(200);
  });
});

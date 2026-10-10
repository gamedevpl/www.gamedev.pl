import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';

describe('DCR redirect URIs', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('rejects DCR redirect URIs that are cleartext off loopback or browser-local schemes', async () => {
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const register = (uri: string) =>
      app!.inject({
        method: 'POST',
        url: '/oauth/register',
        remoteAddress: '203.0.113.60',
        headers: { 'content-type': 'application/json' },
        payload: { redirect_uris: [uri] },
      });
    for (const uri of [
      'http://example.com/callback',
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'https://example.com/callback#frag',
    ]) {
      const res = await register(uri);
      expect(res.statusCode, uri).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_redirect_uri' });
    }
    for (const uri of ['https://example.com/callback', 'cursor://anysphere.cursor-mcp/oauth/callback']) {
      expect((await register(uri)).statusCode, uri).toBe(201);
    }
  });
});

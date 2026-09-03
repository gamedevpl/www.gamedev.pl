import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken } from './auth.js';
import { SESSION_COOKIE_NAME } from './session-cookie.js';
import { InMemoryStore } from './store.js';
import type { ProxyDiagnosticsResponse } from './proxy-diagnostics.js';

const sessionSecret = 'dev-session-secret-change-me';

async function appWith(store: InMemoryStore) {
  return buildApp({ store, sessionSecret, adminUids: 'g:boss' });
}

function session(uid: string) {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('GET /api/diagnostics/proxy', () => {
  it('refuses anonymous callers, so it needs no beta-wall exemption', async () => {
    const app = await appWith(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: '/api/diagnostics/proxy' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('reports the resolved IP and the forwarding chain it came from', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:looker', email: 'looker@example.com' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/proxy',
      headers: {
        cookie: session('g:looker'),
        'x-forwarded-for': '203.0.113.7, 198.51.100.2',
        'fastly-client-ip': '203.0.113.7',
        origin: 'https://www.gamedev.pl',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as ProxyDiagnosticsResponse;
    expect(body.forwardedForHops).toBe(2);
    expect(body.headers['fastly-client-ip']).toBe('203.0.113.7');
    // FH-02 turns on this: does Origin survive the trip?
    expect(body.headers.origin).toBe('https://www.gamedev.pl');
    expect(typeof body.resolvedIp).toBe('string');
    await app.close();
  });

  it('never echoes the credentials the request arrived with', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:looker', email: 'looker@example.com' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/proxy',
      headers: { cookie: session('g:looker'), authorization: 'Bearer gdpl_pat_secret' },
    });

    expect(res.statusCode).toBe(200);
    // Reflecting its own auth header would be a credential leak.
    expect(res.body).not.toContain('gdpl_pat_secret');
    expect(res.body).not.toContain(SESSION_COOKIE_NAME);
    await app.close();
  });
});

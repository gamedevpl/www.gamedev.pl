import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken } from './auth.js';
import { SESSION_COOKIE_NAME } from './session-cookie.js';
import { InMemoryStore } from './store.js';
import type { ProxyDiagnosticsResponse } from './proxy-diagnostics.js';

const sessionSecret = 'dev-session-secret-change-me';

afterEach(() => {
  delete process.env.TRUST_EDGE_CLIENT_IP;
});

async function resolvedIpFor(headers: Record<string, string>) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:looker', email: 'looker@example.com' });
  const app = await buildApp({ store, sessionSecret, adminUids: 'g:boss' });
  const res = await app.inject({
    method: 'GET',
    url: '/api/diagnostics/proxy',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:looker', sessionSecret)}`, ...headers },
  });
  await app.close();
  expect(res.statusCode).toBe(200);
  return (res.json() as ProxyDiagnosticsResponse).clientIp;
}

describe('client address', () => {
  it('ignores the edge header until the deployment says it is trustworthy', async () => {
    const resolved = await resolvedIpFor({
      'x-forwarded-for': '203.0.113.7, 198.51.100.2',
      'fastly-client-ip': '9.9.9.9',
    });
    expect(resolved).toBe('198.51.100.2');
  });

  it('reads the caller from the edge header once it is trusted', async () => {
    process.env.TRUST_EDGE_CLIENT_IP = 'true';
    const resolved = await resolvedIpFor({
      'x-forwarded-for': '203.0.113.7, 198.51.100.2',
      'fastly-client-ip': '160.79.106.128',
    });
    expect(resolved).toBe('160.79.106.128');
  });

  it('still ignores a forged X-Forwarded-For prefix when trusting the edge', async () => {
    process.env.TRUST_EDGE_CLIENT_IP = 'true';
    const resolved = await resolvedIpFor({ 'x-forwarded-for': '9.9.9.9, 198.51.100.2' });
    expect(resolved).toBe('198.51.100.2');
  });

  it('refuses a list in the edge header, which only an untrusted hop would write', async () => {
    process.env.TRUST_EDGE_CLIENT_IP = 'true';
    const resolved = await resolvedIpFor({
      'x-forwarded-for': '203.0.113.7, 198.51.100.2',
      'fastly-client-ip': '9.9.9.9, 160.79.106.128',
    });
    expect(resolved).toBe('198.51.100.2');
  });

  it('falls back when the edge header is absent or blank', async () => {
    process.env.TRUST_EDGE_CLIENT_IP = 'true';
    const resolved = await resolvedIpFor({
      'x-forwarded-for': '203.0.113.7, 198.51.100.2',
      'fastly-client-ip': '   ',
    });
    expect(resolved).toBe('198.51.100.2');
  });
});

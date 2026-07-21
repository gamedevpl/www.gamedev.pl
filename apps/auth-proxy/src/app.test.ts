import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProxy } from './app.js';
import { BudgetTracker } from './budget.js';
import { mintJobToken } from '@gamedevpl/job-auth';

const SECRET = 'proxy-signing-secret';
const REAL_KEY = 'sk-ant-THE-REAL-PROVIDER-KEY';

interface Captured {
  url: string;
  headers: Headers;
}

/** Stands in for the provider so no real network call is made. */
function stubUpstream(captured: Captured[] = []) {
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, captured };
}

async function build(overrides: Parameters<typeof buildProxy>[0] = {}): Promise<FastifyInstance> {
  const { fetchImpl } = stubUpstream();
  return buildProxy({ upstreamApiKey: REAL_KEY, tokenSecret: SECRET, fetchImpl, ...overrides });
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('auth proxy', () => {
  it('refuses to start without a token secret, which would accept any token', async () => {
    await expect(buildProxy({ tokenSecret: '', upstreamApiKey: REAL_KEY })).rejects.toThrow(/AUTH_PROXY_SECRET/);
  });

  it('rejects a request with no token', async () => {
    app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/messages', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    app = await build();
    const forged = mintJobToken('job_1', 'not-the-real-secret');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': forged },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('forwards a valid request and swaps in the real key', async () => {
    const { fetchImpl, captured } = stubUpstream();
    app = await buildProxy({ upstreamApiKey: REAL_KEY, tokenSecret: SECRET, fetchImpl });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': mintJobToken('job_1', SECRET) },
      payload: { hello: 'world' },
    });

    expect(res.statusCode).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    // The real credential is attached on the way out...
    expect(captured[0]?.headers.get('x-api-key')).toBe(REAL_KEY);
  });

  it('never leaks the real key back to the caller', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': mintJobToken('job_1', SECRET) },
      payload: {},
    });

    // This is the property the whole design exists to guarantee: whatever the
    // container sees, it must never be the provider credential.
    expect(res.body).not.toContain(REAL_KEY);
    expect(JSON.stringify(res.headers)).not.toContain(REAL_KEY);
  });

  it('enforces the per-job budget', async () => {
    const { fetchImpl } = stubUpstream();
    app = await buildProxy({
      upstreamApiKey: REAL_KEY,
      tokenSecret: SECRET,
      fetchImpl,
      budget: new BudgetTracker(2),
    });
    const token = mintJobToken('job_greedy', SECRET);
    const send = () =>
      app!.inject({ method: 'POST', url: '/v1/messages', headers: { 'x-api-key': token }, payload: {} });

    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(200);
    // Third call is over budget — a subverted agent can't loop up a huge bill.
    expect((await send()).statusCode).toBe(429);
  });

  it('budgets each job separately', async () => {
    const { fetchImpl } = stubUpstream();
    app = await buildProxy({
      upstreamApiKey: REAL_KEY,
      tokenSecret: SECRET,
      fetchImpl,
      budget: new BudgetTracker(1),
    });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': mintJobToken('job_a', SECRET) },
      payload: {},
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': mintJobToken('job_b', SECRET) },
      payload: {},
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('reports health without exposing the key', async () => {
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', upstreamConfigured: true });
    expect(res.body).not.toContain(REAL_KEY);
  });
});

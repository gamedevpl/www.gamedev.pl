import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerClientAddress, trustProxyOneHop } from './client-address.js';
import { registerRateLimit } from './rate-limit.js';
import {
  IP_BUCKET_REFUSAL_LOG_MSG,
  isUnattributable,
  UNATTRIBUTABLE_CLIENT_LOG_MSG,
} from './client-address-metrics.js';
import { isRateLimited, onIpRefusal } from './ip-rate-limit.js';

describe('isUnattributable', () => {
  it('names the addresses that are never a caller', () => {
    expect(isUnattributable('0.0.0.0')).toBe(true);
    expect(isUnattributable('::')).toBe(true);
    // An upgrade with no socket, a different and already-handled case.
    expect(isUnattributable('')).toBe(false);
    expect(isUnattributable('203.0.113.7')).toBe(false);
  });
});

async function appReporting(records: { msg: string; context: object }[]) {
  const app = Fastify({ trustProxy: trustProxyOneHop, logger: { level: 'warn' } });
  const capture = ((context: object, msg: string) => {
    if (msg === UNATTRIBUTABLE_CLIENT_LOG_MSG || msg === IP_BUCKET_REFUSAL_LOG_MSG) records.push({ msg, context });
  }) as typeof app.log.warn;
  app.log.warn = capture;
  registerClientAddress(app);
  await registerRateLimit(app);
  app.addHook('onRequest', async (request) => {
    request.log.warn = capture;
  });
  app.get('/capped', { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } }, async () => ({ ok: true }));
  // A per-account quota, which is not the shared bucket.
  app.get('/quota', async (_request, reply) => reply.status(429).send({ error: 'daily quota exceeded' }));
  return app;
}

function messages(records: { msg: string }[]) {
  return records.map((r) => r.msg);
}

describe('reporting an unattributable caller', () => {
  afterEach(() => onIpRefusal(null));

  it('separates sharing the bucket from being refused by it', async () => {
    const records: { msg: string; context: object }[] = [];
    const app = await appReporting(records);

    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '0.0.0.0' } });
    expect(messages(records)).toEqual([UNATTRIBUTABLE_CLIENT_LOG_MSG]);

    records.length = 0;
    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '0.0.0.0' } });
    expect(messages(records)).toContain(IP_BUCKET_REFUSAL_LOG_MSG);

    await app.close();
  });

  it('never counts a per-account 429 as the bucket refusing anyone', async () => {
    const records: { msg: string; context: object }[] = [];
    const app = await appReporting(records);

    await app.inject({ method: 'GET', url: '/quota', headers: { 'x-forwarded-for': '0.0.0.0' } });
    await app.close();

    // The volume signal still sees it; the refusal signal must not.
    expect(messages(records)).toEqual([UNATTRIBUTABLE_CLIENT_LOG_MSG]);
  });

  it('stays quiet for a caller it can attribute', async () => {
    const records: { msg: string; context: object }[] = [];
    const app = await appReporting(records);

    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '203.0.113.7' } });
    await app.close();

    expect(records).toHaveLength(0);
  });
});

describe('the in-handler sliding window', () => {
  afterEach(() => onIpRefusal(null));

  it('reports its own refusals, which no response hook could attribute', () => {
    const refused: string[] = [];
    onIpRefusal((ip) => refused.push(ip));
    const buckets = new Map<string, number[]>();

    expect(isRateLimited(buckets, '0.0.0.0', 1000, 1, 60_000)).toBe(false);
    expect(isRateLimited(buckets, '0.0.0.0', 1000, 1, 60_000)).toBe(true);

    expect(refused).toEqual(['0.0.0.0']);
  });
});

describe('the alert that reads these logs', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(resolve(here, '../../../../infra/setup-monitoring.sh'), 'utf8');

  it('filters on the message this module emits', () => {
    expect(UNATTRIBUTABLE_CLIENT_LOG_MSG).toBe('unattributable client address');
    expect(script).toContain(UNATTRIBUTABLE_CLIENT_LOG_MSG);
    expect(IP_BUCKET_REFUSAL_LOG_MSG).toBe('unattributable client refused by ip limiter');
    expect(script).toContain(IP_BUCKET_REFUSAL_LOG_MSG);
  });
});

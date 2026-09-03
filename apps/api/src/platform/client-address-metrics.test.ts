import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerClientAddress } from './client-address.js';
import { registerRateLimit } from './rate-limit.js';
import { isUnattributable, UNATTRIBUTABLE_CLIENT_LOG_MSG } from './client-address-metrics.js';

describe('isUnattributable', () => {
  it('names the addresses that are never a caller', () => {
    expect(isUnattributable('0.0.0.0')).toBe(true);
    expect(isUnattributable('::')).toBe(true);
    expect(isUnattributable('')).toBe(true);
    expect(isUnattributable('203.0.113.7')).toBe(false);
  });
});

async function appReporting(records: object[]) {
  const app = Fastify({
    trustProxy: 1,
    logger: { level: 'warn' },
  });
  app.log.warn = ((context: object, message: string) => {
    if (message === UNATTRIBUTABLE_CLIENT_LOG_MSG) records.push(context);
  }) as typeof app.log.warn;
  registerClientAddress(app);
  await registerRateLimit(app);
  app.addHook('onRequest', async (request) => {
    request.log.warn = app.log.warn;
  });
  app.get('/capped', { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } }, async () => ({ ok: true }));
  return app;
}

describe('reporting an unattributable caller', () => {
  it('records the refusal, which is the question worth answering', async () => {
    const records: { unattributableClient: { rateLimited: boolean; route: string; statusCode: number } }[] = [];
    const app = await appReporting(records as object[]);

    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '0.0.0.0' } });
    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '0.0.0.0' } });
    await app.close();

    expect(records).toHaveLength(2);
    expect(records[0]?.unattributableClient.rateLimited).toBe(false);
    // The second shares the first one's bucket, which is the harm.
    expect(records[1]?.unattributableClient.rateLimited).toBe(true);
    expect(records[1]?.unattributableClient.statusCode).toBe(429);
    expect(records[1]?.unattributableClient.route).toBe('/capped');
  });

  it('stays quiet for a caller it can attribute', async () => {
    const records: object[] = [];
    const app = await appReporting(records);

    await app.inject({ method: 'GET', url: '/capped', headers: { 'x-forwarded-for': '203.0.113.7' } });
    await app.close();

    expect(records).toHaveLength(0);
  });
});

describe('the alert that reads these logs', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(resolve(here, '../../../../infra/setup-monitoring.sh'), 'utf8');

  it('filters on the message this module emits', () => {
    expect(UNATTRIBUTABLE_CLIENT_LOG_MSG).toBe('unattributable client address');
    expect(script).toContain(UNATTRIBUTABLE_CLIENT_LOG_MSG);
  });
});

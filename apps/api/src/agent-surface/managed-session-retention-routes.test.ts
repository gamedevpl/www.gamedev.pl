import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  createManagedSessionRetentionFromEnv,
  registerManagedSessionRetentionRoutes,
  type ManagedSessionRetentionRoutesOptions,
} from './managed-session-retention-routes.js';
import type { ManagedSessionJanitor, SessionPruneOptions } from './managed-session-retention.js';

const NOW = Date.parse('2026-10-17T00:00:00.000Z');
const allow = { verify: async (header: string | undefined) => header === 'Bearer ok' };

function recordingJanitor(fail = false) {
  const calls: SessionPruneOptions[] = [];
  const janitor: ManagedSessionJanitor = {
    async prune(options) {
      calls.push(options);
      if (fail) throw new Error('list failed');
      return { scanned: 5, deleted: 2, failed: 0, pages: 1 };
    },
  };
  return { calls, janitor };
}

async function appWith(options: Partial<ManagedSessionRetentionRoutesOptions>) {
  const app = Fastify();
  await registerManagedSessionRetentionRoutes(app, {
    janitor: null,
    internalAuthVerifier: allow,
    retentionDays: 30,
    maxDeletes: 200,
    now: () => NOW,
    ...options,
  });
  return app;
}

const post = (app: Awaited<ReturnType<typeof appWith>>, authorization?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/internal/managed-session-retention',
    headers: authorization ? { authorization } : {},
  });

describe('managed session retention route', () => {
  it('rejects a caller without a valid token', async () => {
    const { calls, janitor } = recordingJanitor();
    const app = await appWith({ janitor });

    expect((await post(app)).statusCode).toBe(401);
    expect((await post(app, 'Bearer bad')).statusCode).toBe(401);
    expect(calls).toEqual([]);
  });

  it('skips when no janitor is configured', async () => {
    const app = await appWith({ janitor: null });

    const response = await post(app, 'Bearer ok');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ skipped: 'unconfigured' });
  });

  it('prunes with the retention cutoff and returns the tally', async () => {
    const { calls, janitor } = recordingJanitor();
    const app = await appWith({ janitor, retentionDays: 30, maxDeletes: 200 });

    const response = await post(app, 'Bearer ok');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ scanned: 5, deleted: 2, failed: 0, pages: 1 });
    expect(calls).toEqual([{ olderThan: new Date('2026-09-17T00:00:00.000Z'), maxDeletes: 200 }]);
  });

  it('never uses a cutoff under the seven day floor', async () => {
    const { calls, janitor } = recordingJanitor();
    const app = await appWith({ janitor, retentionDays: 0 });

    await post(app, 'Bearer ok');

    expect(calls[0].olderThan).toEqual(new Date('2026-10-10T00:00:00.000Z'));
  });

  it('answers 500 when the prune throws', async () => {
    const { janitor } = recordingJanitor(true);
    const app = await appWith({ janitor });

    const response = await post(app, 'Bearer ok');

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'managed session retention failed' });
  });
});

describe('createManagedSessionRetentionFromEnv', () => {
  const configured = {
    MANAGED_AGENT_API_KEY: 'key',
    MANAGED_AGENT_ID: 'agent_1',
  };

  it('builds a janitor only when key and agent are set; no environment needed', () => {
    expect(createManagedSessionRetentionFromEnv(configured).janitor).not.toBeNull();
    expect(createManagedSessionRetentionFromEnv({ ...configured, MANAGED_AGENT_ID: ' ' }).janitor).toBeNull();
    expect(createManagedSessionRetentionFromEnv({ ...configured, MANAGED_AGENT_API_KEY: '' }).janitor).toBeNull();
    expect(createManagedSessionRetentionFromEnv({}).janitor).toBeNull();
  });

  it('caps deletes at 200 per run', () => {
    expect(createManagedSessionRetentionFromEnv({}).maxDeletes).toBe(200);
  });

  it.each([
    [undefined, 30],
    ['', 30],
    ['garbage', 30],
    ['-5', 30],
    ['12.5', 30],
    ['0', 7],
    ['3', 7],
    ['7', 7],
    [' 45 ', 45],
  ])('reads MANAGED_SESSION_RETENTION_DAYS %j as %d', (raw, days) => {
    expect(createManagedSessionRetentionFromEnv({ MANAGED_SESSION_RETENTION_DAYS: raw }).retentionDays).toBe(days);
  });
});

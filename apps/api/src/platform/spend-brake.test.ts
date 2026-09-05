import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import { lanesFromNotification, parseLanes } from './spend-brake.js';

const sessionSecret = 'dev-session-secret-change-me';

function pushBody(payload: unknown) {
  return { message: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') } };
}

function openIncident(lanes: string, extra: Record<string, unknown> = {}) {
  return { incident: { state: 'OPEN', incident_id: 'inc-1', policy_user_labels: { lanes }, ...extra } };
}

describe('spend brake payload reading', () => {
  it('accepts both separators, since a GCP label cannot hold a comma', () => {
    expect(parseLanes('search,gate')).toEqual(['search', 'gate']);
    expect(parseLanes('search_gate')).toEqual(['search', 'gate']);
  });

  it('ignores names it does not know rather than guessing', () => {
    expect(parseLanes('search,everything,paused')).toEqual(['search']);
    expect(parseLanes('')).toEqual([]);
    expect(parseLanes(undefined)).toEqual([]);
  });

  it('never pauses on a closing notification', () => {
    expect(lanesFromNotification(openIncident('search')).lanes).toEqual(['search']);
    expect(
      lanesFromNotification({ incident: { state: 'CLOSED', policy_user_labels: { lanes: 'search' } } }).lanes,
    ).toEqual([]);
  });

  it('survives a payload shaped like nothing in particular', () => {
    expect(lanesFromNotification(undefined).lanes).toEqual([]);
    expect(lanesFromNotification({}).lanes).toEqual([]);
    expect(lanesFromNotification({ incident: null }).lanes).toEqual([]);
    expect(lanesFromNotification({ incident: { state: 'OPEN' } }).lanes).toEqual([]);
  });
});

describe('POST /api/internal/spend-brake', () => {
  it('refuses an unverified caller — it can pause the product', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => false } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody(openIncident('search')),
    });

    expect(res.statusCode).toBe(401);
    expect((await store.getCreationLimits())?.searchPaused).not.toBe(true);
    await app.close();
  });

  it('pauses the lanes an open incident names, and records what did it', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => true } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody(openIncident('search_gate')),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().paused).toEqual(['search', 'gate']);
    const limits = await store.getCreationLimits();
    expect(limits?.searchPaused).toBe(true);
    expect(limits?.gatePaused).toBe(true);
    // Who pulled it, so a leftover pause is legible as a leftover.
    expect(limits?.updatedBy).toBe('alert:inc-1');
    // Untouched: a brake pauses what the alert named and nothing else.
    expect(limits?.paused).toBe(false);
    await app.close();
  });

  it('pauses nothing when the alert names no lane it knows', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => true } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody(openIncident('something-else')),
    });

    // 200 rather than an error: a redelivery would pause nothing either.
    expect(res.statusCode).toBe(200);
    expect(res.json().paused).toEqual([]);
    expect(await store.getCreationLimits()).toBeNull();
    await app.close();
  });

  it('can never resume a lane, only stop one', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ paused: true }, 'g:boss');
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => true } },
    });

    await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody(openIncident('search')),
    });

    // An operator's pause outlives any alert; resuming is a human decision.
    expect((await store.getCreationLimits())?.paused).toBe(true);
    await app.close();
  });
});

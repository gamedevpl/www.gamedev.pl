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

  it('reads a lowercased lane, since a GCP label cannot hold a capital', () => {
    expect(parseLanes('creation_editing_chat_tabcomplete_search')).toEqual([
      'creation',
      'editing',
      'chat',
      'tabComplete',
      'search',
    ]);
  });

  it('ignores names it does not know rather than guessing', () => {
    expect(parseLanes('search,everything,paused')).toEqual(['search']);
    expect(parseLanes('')).toEqual([]);
    expect(parseLanes(undefined)).toEqual([]);
  });

  it('graduates a budget by how far over it is, cheapest lanes last', () => {
    const budget = { budgetDisplayName: 'zł130 Monthly Budget Alert', costAmount: 140, budgetAmount: 130 };
    // Forecast over: only the agent, the biggest line on the bill.
    expect(lanesFromNotification({ ...budget, forecastThresholdExceeded: 1.2 })).toEqual({
      lanes: ['managed'],
      incidentId: 'budget:zł130 Monthly Budget Alert:forecast:1.2',
      policyName: 'zł130 Monthly Budget Alert',
    });
    // Spent over: plus round 0 (Vertex) and the gate (Cloud Build).
    expect(lanesFromNotification({ ...budget, alertThresholdExceeded: 1.0 })).toEqual({
      lanes: ['managed', 'seeding', 'gate'],
      incidentId: 'budget:zł130 Monthly Budget Alert:spent:1',
      policyName: 'zł130 Monthly Budget Alert',
    });
    // 150% spent: everything, including the lanes that cost pennies.
    expect(lanesFromNotification({ ...budget, alertThresholdExceeded: 1.5 }).lanes).toEqual([
      'creation',
      'editing',
      'chat',
      'tabComplete',
      'search',
      'gate',
      'seeding',
      'managed',
    ]);
  });

  it('lets a per-service budget name its own lanes instead of the ladder', () => {
    const build = { budgetDisplayName: 'Cloud Build lanes=gate', alertThresholdExceeded: 1.0 };
    expect(lanesFromNotification(build)).toEqual({
      lanes: ['gate'],
      incidentId: 'budget:Cloud Build lanes=gate:spent:1',
      policyName: 'Cloud Build lanes=gate',
    });
    expect(lanesFromNotification({ ...build, alertThresholdExceeded: 0.9 }).lanes).toEqual([]);
    expect(
      lanesFromNotification({ budgetDisplayName: 'Vertex lanes=seeding_managed', forecastThresholdExceeded: 1 }).lanes,
    ).toEqual(['seeding', 'managed']);
  });

  it('stays quiet on a routine budget tick under every threshold', () => {
    // Budgets publish every ~20 minutes whether or not anything crossed.
    const tick = { lanes: [], policyName: 'x', reason: 'budget_under_threshold', quiet: true };
    expect(lanesFromNotification({ budgetDisplayName: 'x', costAmount: 3, budgetAmount: 130 })).toEqual(tick);
    expect(lanesFromNotification({ budgetDisplayName: 'x', alertThresholdExceeded: 0.9 })).toEqual(tick);
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

  it('says why it paused nothing, with the policy that sent it', () => {
    expect(lanesFromNotification(undefined).reason).toBe('no_incident');
    expect(lanesFromNotification({ incident: null }).reason).toBe('no_incident');
    expect(
      lanesFromNotification({
        incident: {
          state: 'CLOSED',
          incident_id: 'inc-9',
          policy_name: 'A24',
          policy_user_labels: { lanes: 'search' },
        },
      }),
    ).toEqual({ lanes: [], incidentId: 'inc-9', policyName: 'A24', state: 'CLOSED', reason: 'closed' });
    expect(lanesFromNotification({ incident: { state: 'OPEN', policy_name: 'A1 uptime' } })).toEqual({
      lanes: [],
      policyName: 'A1 uptime',
      state: 'OPEN',
      reason: 'no_lanes_label',
    });
    expect(lanesFromNotification(openIncident('everything'))).toEqual({
      lanes: [],
      incidentId: 'inc-1',
      state: 'OPEN',
      rawLanes: 'everything',
      reason: 'unrecognised_lanes',
    });
    expect(lanesFromNotification(openIncident('search'))).toEqual({
      lanes: ['search'],
      incidentId: 'inc-1',
      state: 'OPEN',
      rawLanes: 'search',
    });
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

  it('pauses the expensive lanes when the budget trips, and only once per alert', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => true } },
    });
    const tick = () =>
      app.inject({
        method: 'POST',
        url: '/api/internal/spend-brake',
        payload: pushBody({ budgetDisplayName: 'zł130 Monthly Budget Alert', alertThresholdExceeded: 1.0 }),
      });

    const first = await tick();
    expect(first.statusCode).toBe(200);
    expect(first.json().paused).toEqual(['managed', 'seeding', 'gate']);
    const limits = await store.getCreationLimits();
    // Agent, round 0 and gate stop; creation and cheap lanes stay open.
    expect(limits).toMatchObject({
      managedBuilderMode: 'off',
      seedingMode: 'off',
      gatePaused: true,
      updatedBy: 'alert:budget:zł130 Monthly Budget Alert:spent:1',
      lastBrakeIncidentId: 'budget:zł130 Monthly Budget Alert:spent:1',
    });
    expect(limits?.paused).not.toBe(true);
    expect(limits?.searchPaused).not.toBe(true);

    // Operator resumes; the same ~40-minute tick must not undo that.
    await store.setCreationLimits({ managedBuilderMode: 'auto', seedingMode: 'auto', gatePaused: false }, 'g:boss');
    const again = await tick();
    expect(again.json()).toEqual({ paused: [], reason: 'already_handled' });
    expect((await store.getCreationLimits())?.gatePaused).toBe(false);

    // A new threshold is a new alert, and pulls again.
    const worse = await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody({ budgetDisplayName: 'zł130 Monthly Budget Alert', alertThresholdExceeded: 1.5 }),
    });
    expect(worse.json().paused).toContain('creation');
    expect((await store.getCreationLimits())?.paused).toBe(true);
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

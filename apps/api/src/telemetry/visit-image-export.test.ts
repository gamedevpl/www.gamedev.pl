import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore, type VisitEvent } from '../platform/store.js';
import { summarizeVisitFunnel } from './visit-funnel.js';
import { summarizeImageExport } from './visit-image-export.js';

function step(visitId: string, value: string): VisitEvent {
  return { visitId, type: 'image_export_step', at: '2026-09-29T10:00:00.000Z', msSinceStart: 0, step: value };
}

describe('summarizeImageExport', () => {
  it('counts prompted visits and their outcomes per visit', () => {
    const read = summarizeImageExport([
      step('a', 'requested'),
      step('a', 'saved'),
      step('a', 'saved'),
      step('b', 'requested'),
      step('b', 'dismissed'),
      step('c', 'rejected'),
      step('c', 'rejected'),
    ]);
    expect(read).toEqual({ requested: 2, saved: 1, dismissed: 1, rejected: 1 });
  });

  it('never counts an outcome whose request batch was lost', () => {
    const read = summarizeImageExport([step('a', 'saved'), step('b', 'dismissed')]);
    expect(read).toEqual({ requested: 0, saved: 0, dismissed: 0, rejected: 0 });
  });

  it('ignores other event types and unknown steps', () => {
    const other = { ...step('a', 'requested'), type: 'share_step' as const };
    expect(summarizeImageExport([other, step('b', 'bogus')])).toEqual({
      requested: 0,
      saved: 0,
      dismissed: 0,
      rejected: 0,
    });
  });
});

describe('image_export_step intake and rollup', () => {
  const sessionSecret = 'dev-session-secret-change-me';
  const visitId = '00000000-0000-4000-8000-000000000000';

  async function post(events: unknown[]) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    const app = await buildApp({ store, sessionSecret });
    const response = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      payload: { visitId, flushMsSinceStart: 0, events },
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:me', sessionSecret)}` },
    });
    return { response, events: await store.listVisitEvents(new Date().toISOString().slice(0, 10)) };
  }

  it('records a step, never a filename, and rejects unknown steps', async () => {
    const ok = await post([{ type: 'image_export_step', step: 'saved', filename: 'me.png', msSinceStart: 0 }]);
    expect(ok.response.statusCode).toBe(202);
    expect(ok.events[0]).toMatchObject({ type: 'image_export_step', step: 'saved' });
    expect(ok.events[0]).not.toHaveProperty('filename');

    const bad = await post([{ type: 'image_export_step', step: 'uploaded', msSinceStart: 0 }]);
    expect(bad.response.statusCode).toBe(400);
  });

  it('surfaces the rollup on the visit funnel', () => {
    const funnel = summarizeVisitFunnel([step('v1', 'requested'), step('v1', 'saved')]);
    expect(funnel.imageExport).toEqual({ requested: 1, saved: 1, dismissed: 0, rejected: 0 });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { createPublishedSlugGate } from '../catalog/published-slugs.js';
import { InMemoryStore } from '../platform/store.js';

// Anonymous vs signed-in split, and crawler drops, on both telemetry streams.

const sessionSecret = 'dev-session-secret-change-me';
const firstId = '00000000-0000-4000-8000-000000000000';
const secondId = '00000000-0000-4000-8000-000000000001';
const signedIn = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:me', sessionSecret)}` };
const googlebot = { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' };
const headless = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
};
const today = () => new Date().toISOString().slice(0, 10);

let store: InMemoryStore;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:me' });
  app = await buildApp({
    store,
    sessionSecret,
    telemetryRoutes: {
      publishedSlugs: createPublishedSlugGate({
        client: { getCatalog: async () => [{ slug: 'space-hop', status: 'published' }] as never },
      }),
    },
  });
});

function play(sessionId: string, headers: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/telemetry',
    headers,
    payload: { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] },
  });
}

function visit(visitId: string, headers: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/telemetry/visit',
    headers,
    payload: { visitId, flushMsSinceStart: 0, events: [{ type: 'visit_started', entry: 'home', msSinceStart: 0 }] },
  });
}

describe('play telemetry cohort', () => {
  it('marks whether the flush carried a session, and nothing more', async () => {
    await play(firstId, signedIn);
    await play(secondId, {});
    const stored = await store.listTelemetryEvents(today());
    expect(new Map(stored.map((event) => [event.sessionId, event.signedIn]))).toEqual(
      new Map([
        [firstId, true],
        [secondId, false],
      ]),
    );
    expect(JSON.stringify(stored)).not.toContain('g:me');
  });

  it('accepts and drops a flush from a self-declared crawler', async () => {
    const response = await play(firstId, { ...signedIn, ...googlebot });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(today())).toEqual([]);
  });
});

describe('visit telemetry cohort', () => {
  it('marks whether the flush carried a session, and nothing more', async () => {
    await visit(firstId, signedIn);
    await visit(secondId, {});
    const stored = await store.listVisitEvents(today());
    expect(new Map(stored.map((event) => [event.visitId, event.signedIn]))).toEqual(
      new Map([
        [firstId, true],
        [secondId, false],
      ]),
    );
    expect(JSON.stringify(stored)).not.toContain('g:me');
  });

  it('accepts and drops a flush from a headless browser', async () => {
    const response = await visit(firstId, headless);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0 });
    expect(await store.listVisitEvents(today())).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import { InMemoryStore } from '../store.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function slugGate(published: string[]): PublishedSlugGate {
  const slugs = new Set(published);
  return { isPublished: async (slug: string) => slugs.has(slug) };
}

const VALID_TEXT = 'Level two is way too hard compared to level one, I quit there every time.';

describe('player feedback route', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
  });

  it('rejects an unauthenticated submission with 401 and stores nothing', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      payload: { text: VALID_TEXT },
    });
    expect(res.statusCode).toBe(401);
    expect(await store.listPlayerFeedback('brick-storm')).toEqual([]);
    await app.close();
  });

  it('rejects a slug outside the published catalog with 404, even for a signed-in player', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/not-a-real-game/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: VALID_TEXT },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects text below the minimum length with 400', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: 'too short' },
    });
    expect(res.statusCode).toBe(400);
    expect(await store.listPlayerFeedback('brick-storm')).toEqual([]);
    await app.close();
  });

  it('rejects text that only clears the minimum before sanitization, without spending quota', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    // Ten asterisks clear the schema's raw-text minimum, survive moderation, and
    // sanitize to the empty string — the stored record would be blank.
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: '**********' },
    });
    expect(res.statusCode).toBe(400);
    expect(await store.listPlayerFeedback('brick-storm')).toEqual([]);

    // The rejection must not have burned the player's daily allowance.
    const usage = await store.getUsage('g:alice', new Date().toISOString().slice(0, 10));
    expect(usage.playerFeedback).toBe(0);
    await app.close();
  });

  it('rejects content that fails moderation with 422 and stores nothing', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      // Matches the PII pattern set (an email address) in moderation-terms.ts.
      payload: { text: 'contact me at exploit@example.com about this awful game please' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'content_rejected' });
    expect(await store.listPlayerFeedback('brick-storm')).toEqual([]);
    await app.close();
  });

  it('moderates the sanitized text too, so markup cannot hide a term the stripper reveals', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    // Markdown emphasis characters are stripped to nothing (HTML tags become a space,
    // so they are not a vector). The raw form does not match the term pattern; the
    // sanitized text that would actually be stored does. Moderating only the raw text
    // would store the slur in its revealed form.
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: 'this game is total sh*it and the controls are broken' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'content_rejected' });
    expect(await store.listPlayerFeedback('brick-storm')).toEqual([]);
    await app.close();
  });

  it('accepts, sanitizes, and stores feedback under games/{slug}, not submissions/{n}', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: `**${VALID_TEXT}**` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const stored = await store.listPlayerFeedback('brick-storm');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.uid).toBe('g:alice');
    // sanitizeCreatorText strips markdown emphasis markers.
    expect(stored[0]!.text).toBe(VALID_TEXT);
    await app.close();
  });

  it('enforces a daily quota separate from the creator feedback counter', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']), dailyPlayerFeedbackQuota: 1 },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: VALID_TEXT },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:alice'),
      payload: { text: 'A completely different piece of feedback about the boss fight.' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: 'daily feedback quota exceeded' });

    const usage = await store.getUsage('g:alice', new Date().toISOString().slice(0, 10));
    expect(usage.playerFeedback).toBe(1);
    expect(usage.feedback).toBe(0);
    await app.close();
  });

  it('blocks a blocked-tier user with 403', async () => {
    await store.upsertUser({ uid: 'g:blocked', tier: 'blocked' });
    const app = await buildApp({
      store,
      sessionSecret,
      playerFeedbackRoutes: { publishedSlugs: slugGate(['brick-storm']) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/feedback',
      headers: authHeaders('g:blocked'),
      payload: { text: VALID_TEXT },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

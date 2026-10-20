import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { ContentChecker, ModerationVerdict } from '../platform/moderation.js';
import { InMemoryStore } from '../platform/store.js';
import { MAX_PROPOSALS_PER_HOUR } from './proposal-text.js';
import { MAX_OPEN_PROPOSALS_PER_TARGET } from './proposal-state.js';
import { memoryGamesStore } from './proposal-round-fixture.js';

const sessionSecret = 'dev-session-secret-change-me';
const OWNER = 'g:kasia';
const PROPOSER = 'g:tomek';
const ADMIN = 'g:boss';
const SLUG = 'neon-drift';
const CATALOG_SLUG = 'sky-dodge';

const cookie = (uid: string) => `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
const BODY = {
  title: 'Add a double jump',
  description: 'Let the car hop once more mid-air so the high ramps are reachable.',
};

describe('POST /api/games/:slug/proposals (text proposals)', () => {
  let store: InMemoryStore;
  let verdict: ModerationVerdict;
  const apps: Array<{ close: () => Promise<void> }> = [];

  beforeEach(async () => {
    store = new InMemoryStore();
    verdict = { allowed: true };
    for (const uid of [OWNER, PROPOSER, ADMIN]) await store.upsertUser({ uid, name: uid });
    const job = await store.createSubmission(999, OWNER, 'Neon Drift');
    await store.setSubmissionSlug(job.jobId, SLUG);
    await store.recordJobTransition(job.jobId, { to: 'published', at: new Date().toISOString(), by: 'operator' });
    await store.setPublication({ slug: SLUG, state: 'published', currentVersion: 'base-1', publishedAt: 'x' });
    await store.putContributionSettings({ slug: SLUG, mode: 'review', updatedAt: new Date().toISOString() });
  });

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function app(withGamesStore = true) {
    const contentChecker: ContentChecker = { check: async () => verdict, checkFields: async () => verdict };
    const built = await buildApp({
      store,
      sessionSecret,
      adminUids: ADMIN,
      contentChecker,
      ...(withGamesStore ? { submissionRoutes: { agentChannel: { gamesStore: memoryGamesStore() } } } : {}),
    });
    apps.push(built);
    return built;
  }

  const post = async (slug: string, uid: string | null, payload: object = BODY) =>
    (await app()).inject({
      method: 'POST',
      url: `/api/games/${slug}/proposals`,
      headers: uid ? { cookie: cookie(uid) } : {},
      payload,
    });

  it('opens a reviewer-visible text proposal and tells the owner', async () => {
    const response = await post(SLUG, PROPOSER);
    expect(response.statusCode).toBe(201);
    const { proposal } = response.json();
    expect(proposal).toMatchObject({ kind: 'text', state: 'in_review', title: BODY.title, platformOwned: false });
    expect(proposal.version).toBeUndefined();
    expect(proposal.base).toEqual({ kind: 'store', version: 'base-1' });

    const notes = await store.listNotifications(OWNER);
    expect(notes.map((note) => note.type)).toContain('proposal.awaiting_review');

    // The owner sees it in their queue; it has no diff.
    const reviews = await (
      await app()
    ).inject({ method: 'GET', url: '/api/me/reviews', headers: { cookie: cookie(OWNER) } });
    expect(reviews.json().proposals.map((row: { id: string }) => row.id)).toEqual([proposal.id]);
    const diff = await (
      await app()
    ).inject({
      method: 'GET',
      url: `/api/proposals/${proposal.id}/diff`,
      headers: { cookie: cookie(OWNER) },
    });
    expect(diff.statusCode).toBe(404);
  });

  it('alerts the admins for a catalog game', async () => {
    const response = await post(CATALOG_SLUG, PROPOSER);
    expect(response.statusCode).toBe(201);
    expect(response.json().proposal).toMatchObject({ kind: 'text', state: 'in_review', platformOwned: true });
    const alerts = (await store.listNotifications(ADMIN)).filter((row) => row.type === 'operator.proposal_feedback');
    expect(alerts).toHaveLength(1);
  });

  it('refuses when contributions are off, and masks a block the same way', async () => {
    await store.putContributionSettings({ slug: SLUG, mode: 'off', updatedAt: new Date().toISOString() });
    expect((await post(SLUG, PROPOSER)).json()).toEqual({ error: 'contributions_off' });

    await store.putContributionSettings({ slug: SLUG, mode: 'review', updatedAt: new Date().toISOString() });
    await store.blockContributor({ ownerUid: OWNER, blockedUid: PROPOSER, createdAt: new Date().toISOString() });
    const blocked = await post(SLUG, PROPOSER);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: 'contributions_off' });
    const contributions = await (
      await app()
    ).inject({
      method: 'GET',
      url: `/api/games/${SLUG}/contributions`,
      headers: { cookie: cookie(PROPOSER) },
    });
    expect(contributions.json()).toEqual({ canPropose: false, reason: 'contributions_off' });
  });

  it('refuses the owner and a game that is not live', async () => {
    const own = await post(SLUG, OWNER);
    expect(own.statusCode).toBe(403);
    expect(own.json()).toEqual({ error: 'own_game' });

    await store.setPublication({ slug: SLUG, state: 'disabled', currentVersion: 'base-1', publishedAt: 'x' });
    const down = await post(SLUG, PROPOSER);
    expect(down.statusCode).toBe(403);
    expect(down.json()).toEqual({ error: 'not_published' });
  });

  it('caps open proposals per game, then rate-limits per hour', async () => {
    for (let i = 0; i < MAX_OPEN_PROPOSALS_PER_TARGET; i += 1)
      expect((await post(SLUG, PROPOSER)).statusCode).toBe(201);
    const capped = await post(SLUG, PROPOSER);
    expect(capped.statusCode).toBe(429);
    expect(capped.json()).toEqual({ error: 'too_many_open' });

    // Another game has room, but the hourly ceiling counts every proposal.
    const room = MAX_PROPOSALS_PER_HOUR - MAX_OPEN_PROPOSALS_PER_TARGET;
    for (let i = 0; i < room; i += 1) expect((await post(CATALOG_SLUG, PROPOSER)).statusCode).toBe(201);
    const limited = await post(CATALOG_SLUG, PROPOSER);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'rate_limited' });
  });

  it('rejects moderated text and reports a moderation outage distinctly', async () => {
    verdict = { allowed: false, category: 'hate' };
    const rejected = await post(SLUG, PROPOSER);
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json()).toEqual({ error: 'content_rejected', category: 'hate' });

    verdict = { allowed: false, unavailable: true };
    const outage = await post(SLUG, PROPOSER);
    expect(outage.statusCode).toBe(503);
    expect(outage.json()).toMatchObject({ error: 'moderation_unavailable' });
    expect(await store.listProposals({ proposerUid: PROPOSER })).toHaveLength(0);
  });

  it('refuses to open one a reviewer could not act on (no games store)', async () => {
    const response = await (
      await app(false)
    ).inject({
      method: 'POST',
      url: `/api/games/${SLUG}/proposals`,
      headers: { cookie: cookie(PROPOSER) },
      payload: BODY,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'store_unavailable' });
    expect(await store.listProposals()).toEqual([]);
  });

  it('declines a change request on a text proposal: nothing to resubmit', async () => {
    const { proposal } = (await post(SLUG, PROPOSER)).json();
    const response = await (
      await app()
    ).inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/changes`,
      headers: { cookie: cookie(OWNER) },
      payload: { text: 'Please make it shorter.' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'not_revisable' });
  });

  it('validates input and requires a session', async () => {
    expect((await post(SLUG, null)).statusCode).toBe(401);
    expect((await post(SLUG, PROPOSER, { title: 'ok', description: BODY.description })).statusCode).toBe(400);
    expect((await post(SLUG, PROPOSER, { title: BODY.title, description: 'too short' })).statusCode).toBe(400);
  });
});

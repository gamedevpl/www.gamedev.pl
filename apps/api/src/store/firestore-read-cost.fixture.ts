import type { FastifyInstance } from 'fastify';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { mintToken } from '../platform/submission-token.js';
import { FirestoreStore, type Store } from '../platform/store.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import { fakeFirestore } from './fake-firestore.js';

export const SESSION_SECRET = 'dev-session-secret-change-me';
export const SUBMISSION_SECRET = 'read-cost-token-secret';
export const AT = '2026-01-15T12:00:00.000Z';

export const CREATOR_UID = 'g:creator';
export const DERIVED_OWNER_UID = 'g:derived-owner';
export const REVIEWER_UID = 'g:reviewer';
export const DECOY_UID = 'g:decoy';
export const DECOY_REVIEWER_UID = 'g:decoy-reviewer';
export const ADMIN_UID = 'g:operator';
export const POLLED_JOB_ID = 1001;

// A second round on the same slug: its poll pays for history.
export const PRIOR_ROUNDS_JOB_ID = 1002;

// Stuck in dispatched long after boot, like prod job 1000167.
export const STALE_DISPATCH_JOB_ID = 1009;

export const POLLED_ROUTES = [
  'GET /api/submissions/:token',
  'GET /api/submissions/:token (steady state)',
  'GET /api/submissions/:token (share link, steady state)',
  'GET /api/submissions/:token (prior rounds)',
  'GET /api/submissions/:token (prior rounds, steady state)',
  'GET /api/submissions/:token (stale dispatch, steady state)',
  'GET /api/submissions/mine',
  'GET /api/submissions/mine (derived-only owner)',
  'GET /api/submissions/mine (document, steady state)',
  'GET /api/review/status',
  'GET /api/notifications',
  'GET /api/admin/summary (steady state)',
] as const;

export type PolledRoute = (typeof POLLED_ROUTES)[number];

const CHECKLIST = {
  graphics: 'ok',
  gameplay: 'ok',
  fun: 'ok',
  sound: 'ok',
  controls: 'ok',
} as const;

const CATALOG = [
  { slug: 'catalog-aurora', title: 'Aurora', creatorHandle: null, genre: 'arcade', media: null },
  { slug: 'catalog-beacon', title: 'Beacon', creatorHandle: 'ada', genre: 'racing', media: null },
  { slug: 'catalog-cinder', title: 'Cinder', creatorHandle: null, genre: 'puzzle', media: null },
];

const CREATOR_ROUNDS: Array<{ jobId: number; slug: string; title: string }> = [
  { jobId: 1001, slug: 'comet-courier', title: 'Comet Courier' },
  { jobId: 1002, slug: 'comet-courier', title: 'Comet Courier' },
  { jobId: 1003, slug: 'sky-dodge', title: 'Sky Dodge' },
  { jobId: 1004, slug: 'sky-dodge', title: 'Sky Dodge' },
  { jobId: 1005, slug: 'neon-lane', title: 'Neon Lane' },
  { jobId: 1006, slug: 'dune-runner', title: 'Dune Runner' },
  { jobId: 1007, slug: 'dune-runner', title: 'Dune Runner' },
  { jobId: 1008, slug: 'harbor-pilot', title: 'Harbor Pilot' },
];

// No gameAccess rows: the 193 slugs the backfill left derived.
const DERIVED_OWNER_ROUNDS: Array<{ jobId: number; slug: string; title: string }> = [
  { jobId: 3001, slug: 'tide-pool', title: 'Tide Pool' },
  { jobId: 3002, slug: 'glass-reef', title: 'Glass Reef' },
  { jobId: 3003, slug: 'ember-drift', title: 'Ember Drift' },
];

const DECOY_ROUNDS: Array<{ jobId: number; slug: string; title: string }> = [
  { jobId: 2001, slug: 'decoy-alpha', title: 'Decoy Alpha' },
  { jobId: 2002, slug: 'decoy-bravo', title: 'Decoy Bravo' },
  { jobId: 2003, slug: 'decoy-charlie', title: 'Decoy Charlie' },
  { jobId: 2004, slug: 'decoy-delta', title: 'Decoy Delta' },
  { jobId: 2005, slug: 'decoy-echo', title: 'Decoy Echo' },
  { jobId: 2006, slug: 'decoy-foxtrot', title: 'Decoy Foxtrot' },
  { jobId: 2007, slug: 'decoy-golf', title: 'Decoy Golf' },
  { jobId: 2008, slug: 'decoy-hotel', title: 'Decoy Hotel' },
  { jobId: 2009, slug: 'decoy-india', title: 'Decoy India' },
  { jobId: 2010, slug: 'decoy-juliet', title: 'Decoy Juliet' },
  { jobId: 2011, slug: 'decoy-kilo', title: 'Decoy Kilo' },
  { jobId: 2012, slug: 'decoy-lima', title: 'Decoy Lima' },
];

const POLLED_EVENTS = ['planning', 'art', 'mechanics', 'testing', 'polishing'] as const;
const POLLED_MESSAGES = ['Slow the asteroids.', 'Add a second lane.', 'Keep the palette warm.'] as const;

const CREATOR_NOTIFICATIONS = [
  'sub-1001-published',
  'sub-1003-building',
  'sub-1005-needs-changes',
  'sub-1006-published',
  'share-sky-dodge',
  'digest-2026-w02',
] as const;

const DECOY_NOTIFICATIONS = [
  'decoy-n01',
  'decoy-n02',
  'decoy-n03',
  'decoy-n04',
  'decoy-n05',
  'decoy-n06',
  'decoy-n07',
  'decoy-n08',
  'decoy-n09',
  'decoy-n10',
] as const;

const REVIEWER_ASSESSMENTS = [
  'catalog-aurora',
  'catalog-beacon',
  'catalog-cinder',
  'comet-courier',
  'sky-dodge',
  'neon-lane',
  'dune-runner',
] as const;

const DECOY_ASSESSMENTS = [
  'decoy-alpha',
  'decoy-bravo',
  'decoy-charlie',
  'decoy-delta',
  'decoy-echo',
  'decoy-foxtrot',
  'decoy-golf',
  'decoy-hotel',
  'decoy-india',
  'decoy-juliet',
  'decoy-kilo',
  'decoy-lima',
  'harbor-pilot',
  'catalog-aurora',
  'catalog-beacon',
] as const;

const DECOY_RE_REVIEWS = ['decoy-alpha', 'decoy-bravo', 'decoy-charlie', 'decoy-delta'] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sessionCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}`;
}

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  } as unknown as GitHubClient;
}

function stubBackend(): AgentBackend {
  return {
    name: 'stub',
    dispatch: async () => ({ ref: 'task-1', workspace: 'copilot/x' }),
    resume: async () => ({ ref: 'task-2', workspace: 'copilot/y' }),
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
}

async function seedUser(store: Store, uid: string): Promise<void> {
  await store.upsertUser({ uid, activeDays: [today()] });
}

async function seedRound(
  store: Store,
  ownerUid: string,
  round: { jobId: number; slug: string; title: string },
): Promise<void> {
  await store.createSubmission(round.jobId, ownerUid, round.title);
  await store.setSubmissionSlug(round.jobId, round.slug);
  await store.ensureGameAccess(round.slug, ownerUid, AT, AT);
}

// No public skip of that row; wrapping this delete drops the shape.
async function dropGameAccess(store: Store, slug: string): Promise<void> {
  const firestore = store as unknown as {
    db?: { collection: (name: string) => { doc: (id: string) => { delete: () => Promise<unknown> } } };
  };
  if (!firestore.db) throw new Error(`no gameAccess store for ${slug}`);
  await firestore.db.collection('gameAccess').doc(slug).delete();
}

async function seedDerivedOnlyRound(
  store: Store,
  ownerUid: string,
  round: { jobId: number; slug: string; title: string },
): Promise<void> {
  await store.createSubmission(round.jobId, ownerUid, round.title);
  await store.setSubmissionSlug(round.jobId, round.slug);
  await dropGameAccess(store, round.slug);
}

async function seedNotification(store: Store, uid: string, id: string, index: number): Promise<void> {
  const second = String(index + 1).padStart(2, '0');
  await store.createNotification(uid, {
    id,
    type: 'submission.published',
    titleKey: 'notifications.submission.published.title',
    bodyKey: 'notifications.submission.published.body',
    params: { title: id },
    link: `/play/${id}`,
    createdAt: `2026-01-15T12:00:${second}.000Z`,
  });
}

async function seedAssessment(store: Store, reviewerUid: string, slug: string): Promise<void> {
  await store.upsertGameAssessment({
    slug,
    title: slug,
    source: 'catalog',
    creatorHandle: null,
    reviewerUid,
    verdict: 'keep',
    note: 'ok',
    noteOrigin: 'text',
    checklist: CHECKLIST,
    clientContext: null,
    gameVersion: null,
  });
}

export async function seedReadCostFixture(store: Store): Promise<void> {
  await seedUser(store, CREATOR_UID);
  await seedUser(store, DERIVED_OWNER_UID);
  await seedUser(store, REVIEWER_UID);
  await seedUser(store, ADMIN_UID);
  await seedUser(store, DECOY_UID);
  await seedUser(store, DECOY_REVIEWER_UID);

  for (const round of CREATOR_ROUNDS) await seedRound(store, CREATOR_UID, round);
  for (const round of DERIVED_OWNER_ROUNDS) await seedDerivedOnlyRound(store, DERIVED_OWNER_UID, round);
  for (const round of DECOY_ROUNDS) await seedRound(store, DECOY_UID, round);

  // Most open rounds carry the sweep's empty stamp; two do not.
  const unstamped = new Set(DECOY_ROUNDS.slice(-2).map((round) => round.jobId));
  for (const round of [...CREATOR_ROUNDS, ...DERIVED_OWNER_ROUNDS, ...DECOY_ROUNDS]) {
    if (!unstamped.has(round.jobId)) await store.listPendingCreatorMessages(round.jobId, { stampEmpty: true });
  }

  await store.recordJobTransition(POLLED_JOB_ID, { to: 'building', at: AT, by: 'agent', reason: 'started' });
  await store.setSubmissionNotifiedStatus(POLLED_JOB_ID, 'building');
  await store.setSubmissionLastStatus(POLLED_JOB_ID, 'building');

  for (const [index, step] of POLLED_EVENTS.entries()) {
    await store.appendBuildEvent(POLLED_JOB_ID, {
      kind: 'step',
      step,
      text: `${step} the round.`,
      createdAt: `2026-01-15T12:01:0${index}.000Z`,
    });
  }
  for (const text of POLLED_MESSAGES) await store.appendCreatorMessage(POLLED_JOB_ID, text);

  // Dispatched long ago, with a real round's conversation.
  await store.createSubmission(STALE_DISPATCH_JOB_ID, CREATOR_UID, 'Tabletop Turbos');
  await store.setSubmissionSlug(STALE_DISPATCH_JOB_ID, 'tabletop-turbos');
  await store.recordJobTransition(STALE_DISPATCH_JOB_ID, { to: 'dispatched', at: AT, by: 'agent', reason: 'dispatched' });
  for (const text of POLLED_MESSAGES) await store.appendCreatorMessage(STALE_DISPATCH_JOB_ID, text);

  // The later round: its poll reads the slug's history.
  await store.recordJobTransition(PRIOR_ROUNDS_JOB_ID, { to: 'building', at: AT, by: 'agent', reason: 'started' });
  await store.setSubmissionNotifiedStatus(PRIOR_ROUNDS_JOB_ID, 'building');
  await store.setSubmissionLastStatus(PRIOR_ROUNDS_JOB_ID, 'building');

  // A live round carries its own events, not only history.
  for (const [index, step] of POLLED_EVENTS.entries()) {
    await store.appendBuildEvent(PRIOR_ROUNDS_JOB_ID, {
      kind: 'step',
      step,
      text: `${step} the later round.`,
      createdAt: `2026-01-15T12:02:0${index}.000Z`,
    });
  }
  for (const text of POLLED_MESSAGES) await store.appendCreatorMessage(PRIOR_ROUNDS_JOB_ID, text);

  for (const [index, id] of CREATOR_NOTIFICATIONS.entries()) {
    await seedNotification(store, CREATOR_UID, id, index);
  }
  for (const [index, id] of DECOY_NOTIFICATIONS.entries()) {
    await seedNotification(store, DECOY_UID, id, index);
  }

  for (const slug of REVIEWER_ASSESSMENTS) await seedAssessment(store, REVIEWER_UID, slug);
  for (const slug of DECOY_ASSESSMENTS) await seedAssessment(store, DECOY_REVIEWER_UID, slug);

  await store.upsertReReviewRequests(
    DECOY_RE_REVIEWS.map((slug) => ({
      slug,
      reviewerUid: DECOY_REVIEWER_UID,
      gameVersion: null,
      reason: null,
      createdBy: 'g:admin',
    })),
  );

  await store.createReviewSweep({
    id: 'swp-read-cost',
    status: 'active',
    source: 'catalog',
    slugs: CATALOG.map((entry) => entry.slug),
    releasedCount: CATALOG.length,
    releasePerDay: null,
    startedAt: AT,
    note: null,
    createdAt: AT,
    createdBy: 'g:admin',
    updatedAt: AT,
    updatedBy: 'g:admin',
    notifiedAt: null,
    notifiedCount: 0,
  });
}

export async function createReadCostApp(store: Store, now?: () => number): Promise<FastifyInstance> {
  return buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    adminUids: ADMIN_UID,
    reviewerUids: REVIEWER_UID,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: SUBMISSION_SECRET,
      agentBackend: stubBackend(),
      ...(now ? { now } : {}),
    },
    reviewRoutes: { listCatalog: async () => CATALOG },
  });
}

export interface RouteReadMeasurement {
  route: PolledRoute;
  reads: number;
  statusCode: number;
}

async function injectRoute(app: FastifyInstance, route: PolledRoute): Promise<{ statusCode: number }> {
  if (route === 'GET /api/submissions/:token') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/:token (steady state)') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/:token (prior rounds)' || route === 'GET /api/submissions/:token (prior rounds, steady state)') {
    const token = mintToken(PRIOR_ROUNDS_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/admin/summary (steady state)') {
    return app.inject({ method: 'GET', url: '/api/admin/summary', headers: { cookie: sessionCookie(ADMIN_UID) } });
  }
  if (route === 'GET /api/submissions/:token (stale dispatch, steady state)') {
    const token = mintToken(STALE_DISPATCH_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/:token (share link, steady state)') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({ method: 'GET', url: `/api/submissions/${token}` });
  }
  if (route === 'GET /api/submissions/mine') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/mine (document, steady state)') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/mine (derived-only owner)') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(DERIVED_OWNER_UID) },
    });
  }
  if (route === 'GET /api/review/status') {
    return app.inject({
      method: 'GET',
      url: '/api/review/status',
      headers: { cookie: sessionCookie(REVIEWER_UID) },
    });
  }
  return app.inject({
    method: 'GET',
    url: '/api/notifications',
    headers: { cookie: sessionCookie(CREATOR_UID) },
  });
}

export async function measurePolledRoute(route: PolledRoute): Promise<RouteReadMeasurement> {
  const fake = fakeFirestore();
  const store = new FirestoreStore(fake.db);
  await seedReadCostFixture(store);
  // Moved by hand, so a poll can outlive a short cache.
  let clock = Date.now();
  const app = await createReadCostApp(store, () => clock);
  try {
    // A process verifies its first read; steady state is the second.
    if (route === 'GET /api/submissions/mine (document, steady state)') {
      await injectRoute(app, route);
    }
    // What a 3s poll costs with the route's caches warm.
    if (route === 'GET /api/submissions/:token (steady state)') {
      await injectRoute(app, route);
    }
    // The same poll with no session resolves no access.
    if (route === 'GET /api/submissions/:token (share link, steady state)') {
      await injectRoute(app, route);
    }
    // A stuck dispatch is polled for days; the second poll bills.
    if (route === 'GET /api/submissions/:token (stale dispatch, steady state)') {
      await injectRoute(app, route);
      // The production cadence: past a 2s cache, well inside a 60s one.
      clock += 4_000;
    }
    // The first call pays the backfill; a 30s poll does not.
    if (route === 'GET /api/admin/summary (steady state)') {
      await injectRoute(app, route);
      // Past the first hour, when an empty stamp is trusted.
      clock += 61 * 60_000;
    }
    // A later round polls its history; the first has none.
    if (route === 'GET /api/submissions/:token (prior rounds, steady state)') {
      await injectRoute(app, route);
    }
    fake.resetBilledReads();
    const res = await injectRoute(app, route);
    return { route, reads: fake.billedReads(), statusCode: res.statusCode };
  } finally {
    await app.close();
  }
}

export async function measurePolledRouteReads(): Promise<Record<PolledRoute, number>> {
  const measured = {} as Record<PolledRoute, number>;
  for (const route of POLLED_ROUTES) {
    const row = await measurePolledRoute(route);
    if (row.statusCode !== 200) {
      throw new Error(`${route} returned ${row.statusCode} (want 200)`);
    }
    measured[route] = row.reads;
  }
  return measured;
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('firestore-read-cost.fixture.ts') || invoked.endsWith('firestore-read-cost.fixture.js')) {
  measurePolledRouteReads()
    .then((measured) => {
      process.stdout.write(`${JSON.stringify(measured, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

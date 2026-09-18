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
export const REVIEWER_UID = 'g:reviewer';
export const DECOY_UID = 'g:decoy';
export const DECOY_REVIEWER_UID = 'g:decoy-reviewer';
export const POLLED_JOB_ID = 1001;

export const POLLED_ROUTES = [
  'GET /api/submissions/:token',
  'GET /api/submissions/mine',
  'GET /api/review/status',
  'GET /api/notifications',
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
  await seedUser(store, REVIEWER_UID);
  await seedUser(store, DECOY_UID);
  await seedUser(store, DECOY_REVIEWER_UID);

  for (const round of CREATOR_ROUNDS) await seedRound(store, CREATOR_UID, round);
  for (const round of DECOY_ROUNDS) await seedRound(store, DECOY_UID, round);

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

export async function createReadCostApp(store: Store): Promise<FastifyInstance> {
  return buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    reviewerUids: REVIEWER_UID,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: SUBMISSION_SECRET,
      agentBackend: stubBackend(),
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
  if (route === 'GET /api/submissions/mine') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(CREATOR_UID) },
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
  const app = await createReadCostApp(store);
  try {
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

import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import type { AgentBackend } from './agent-surface/agent-backend.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import type { GamesStore } from './delivery/games-store.js';
import { InMemoryStore } from './platform/store.js';
import type { ManagedAvailabilityGate } from './agent-surface/managed-availability.js';

export const SECRET = 'transfer-flow-secret';
export const SESSION_SECRET = 'dev-session-secret-change-me';
export const SENDER = 'g:sender';
export const RECIPIENT = 'g:recipient';

export const BUNDLE_HTML = '<!doctype html><title>Comet Courier</title>';
export const GATE_REPORT = 'Frame budget exceeded on the asteroid field.';
export const BUILD_SUMMARY = 'Slowed the asteroids and retuned the spawn curve.';

export function session(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}` };
}

// Only the calls the transfer flow makes; the rest never fire here.
export function stubGitHub(): GitHubClient {
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

export function stubBackend(): AgentBackend {
  return {
    name: 'stub',
    dispatch: async () => ({ ref: 'task-1', workspace: 'copilot/x' }),
    resume: async () => ({ ref: 'task-2', workspace: 'copilot/y' }),
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
}

// One playable version; `priorJobId` adds a second with no stored summary.
export function stubGamesStore(priorJobId?: number): GamesStore {
  const manifest = {
    version: 'v1',
    createdAt: '2026-09-01T00:00:00.000Z',
    deliveryMode: 'preview' as const,
    previewGate: { green: false, ranAt: '2026-09-01T00:01:00.000Z', report: GATE_REPORT },
    summary: BUILD_SUMMARY,
    authorship: 'agent' as const,
    sourceFiles: ['game.js'],
  };
  const prior = {
    version: 'v0',
    createdAt: '2026-08-31T00:00:00.000Z',
    deliveryMode: 'preview' as const,
    previewGate: { green: true, ranAt: '2026-08-31T00:01:00.000Z' },
    jobId: priorJobId,
  };
  const versions = priorJobId === undefined ? [manifest] : [manifest, prior];
  return {
    getDerivedArtifact: async (_slug: string, _version: string, name: string) =>
      name === 'bundle.html' ? Buffer.from(BUNDLE_HTML, 'utf8') : null,
    getManifest: async () => manifest,
    listVersions: async () => versions,
  } as unknown as GamesStore;
}

// Caller owns the array, so each test file closes its own apps.
export async function createTransferApp(
  store: InMemoryStore,
  apps: FastifyInstance[],
  managedAvailabilityGate?: ManagedAvailabilityGate,
  gamesStore: GamesStore = stubGamesStore(),
) {
  const app = await buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    contentChecker: { check: async () => ({ allowed: true }), checkFields: async () => ({ allowed: true }) },
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: SECRET,
      agentBackend: stubBackend(),
      agentChannel: { gamesStore } as { gamesStore?: GamesStore },
      chatAgent: { decide: async () => ({ kind: 'build' as const, text: 'On it!' }) },
      ...(managedAvailabilityGate ? { managedAvailabilityGate } : {}),
    },
  });
  apps.push(app);
  return app;
}

// A game owned by SENDER, with a round's history behind it.
export async function gameWithHistory(store: InMemoryStore, opts?: { published?: boolean }) {
  await store.upsertUser({ uid: SENDER });
  await store.upsertUser({ uid: RECIPIENT });
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, SENDER, 'Comet Courier');
  const at = (await store.getSubmission(jobId))!.createdAt;
  await store.setSubmissionSlug(jobId, 'comet-courier');
  await store.setSubmissionDeliveredVersion(jobId, 'v1');
  await store.appendCreatorMessage(jobId, 'Make the asteroids slower.');
  await store.appendBuildEvent(jobId, {
    kind: 'done',
    step: 'polishing',
    text: 'Asteroid speed reduced.',
    createdAt: at,
  });
  await store.recordJobTransition(jobId, { to: 'ready_for_review', at, by: 'gate', reason: 'gate_green' });
  const shot = await store.appendBuildShot(jobId, {
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    mediaType: 'image/png',
    label: 'Opening screen',
  });
  if (opts?.published) {
    await store.setSubmissionPublishedAt(jobId, at);
    await store.setPublication({ slug: 'comet-courier', state: 'published', currentVersion: 'v1', publishedAt: at });
  }
  await store.ensureGameAccess('comet-courier', SENDER, at, at);
  return { jobId, at, shotId: shot.id };
}

// The real handover, over the routes a creator uses.
export async function handOver(
  app: FastifyInstance,
  store: InMemoryStore,
  from: string,
  to: string,
  at: string,
): Promise<void> {
  const code = await store.ensureRecipientCode(to, at);
  const initiated = await app.inject({
    method: 'POST',
    url: '/api/me/studio/games/comet-courier/transfer',
    headers: session(from),
    payload: { recipientCode: code },
  });
  expect(initiated.statusCode).toBe(200);
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/me/transfers/comet-courier/accept',
    headers: session(to),
    payload: { invitationId: initiated.json().transfer.invitationId },
  });
  expect(accepted.statusCode).toBe(200);
}

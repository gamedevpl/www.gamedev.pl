import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { mintToken } from '../platform/submission-token.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { takeDownSlug } from './moderation-flags.js';
import { RECIPIENT, SECRET, SENDER, createTransferApp, gameWithHistory, session } from '../game-transfer-fixtures.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

it('applies a current slug takedown to historical shared preview tokens', async () => {
  const store = new InMemoryStore();
  const { jobId, at } = await gameWithHistory(store);
  await store.setDraftShared(jobId, at);
  const newerJob = await store.allocateJobId();
  await store.createSubmission(newerJob, SENDER, 'New version');
  await store.setSubmissionSlug(newerJob, 'comet-courier');
  await store.setSubmissionDeliveredVersion(newerJob, 'v2');
  await store.setDraftShared(newerJob, at);
  const gamesStore = {
    getManifest: async () => ({ version: 'v1', gate: { green: true } }),
    getDerivedArtifact: async () => Buffer.from('<!doctype html><title>Historical</title>'),
  } as unknown as GamesStore;
  const app = await createTransferApp(store, apps, undefined, gamesStore);
  const url = `/api/submissions/${mintToken(jobId, SECRET)}/preview`;
  const before = await app.inject({ method: 'GET', url, headers: session(RECIPIENT) });
  expect(before.statusCode).toBe(200);
  const outcome = await takeDownSlug({
    store,
    slug: 'comet-courier',
    reason: 'fixture takedown',
    at,
    invalidatePublishedGameCaches: () => {},
  });
  expect(outcome.blocked).toBe(true);
  expect((await store.getSubmission(jobId))?.moderationBlockedAt).toBeUndefined();
  const historical = await app.inject({ method: 'GET', url, headers: session(RECIPIENT) });
  expect(historical.statusCode).toBe(404);
  const current = await app.inject({ method: 'GET', url: '/api/drafts/comet-courier', headers: session(RECIPIENT) });
  expect(current.statusCode).toBe(404);
  const owner = await app.inject({ method: 'GET', url, headers: session(SENDER) });
  expect(owner.statusCode).toBe(200);
});

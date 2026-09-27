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

it.each([false, true])('keeps historical previews closed after takedown (adoption: %s)', async (adopted) => {
  const store = new InMemoryStore();
  const { jobId, at } = await gameWithHistory(store);
  await store.setDraftShared(jobId, at);
  const newerJob = await store.allocateJobId();
  await store.createSubmission(newerJob, SENDER, 'New version');
  await store.setSubmissionSlug(newerJob, 'comet-courier');
  await store.setSubmissionDeliveredVersion(newerJob, 'v2');
  await store.setDraftShared(newerJob, at);
  await store.recordJobTransition(newerJob, { to: 'ready_for_review', at, by: 'gate' });
  await store.setPublication({ slug: 'comet-courier', state: 'published', currentVersion: 'v1', publishedAt: at });
  const gamesStore = {
    getManifest: async () => ({ version: 'v1', gate: { green: true } }),
    getDerivedArtifact: async () => Buffer.from('<!doctype html><title>Historical</title>'),
    adoptProposalVersion: async () => {},
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
  expect(outcome.unpublished).toBe(true);
  expect((await store.getSubmission(jobId))?.moderationBlockedAt).toBeUndefined();
  if (adopted) {
    await store.putProposal({
      id: 'pending-proposal',
      targetSlug: 'comet-courier',
      targetOwnerUid: SENDER,
      proposerUid: RECIPIENT,
      base: { kind: 'store', version: 'v1' },
      version: 'v3',
      state: 'in_review',
      stateSince: at,
      transitions: [],
      title: 'Improve the game',
      description: 'A pending change',
      thread: [],
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/proposals/pending-proposal/accept',
      headers: session(SENDER),
    });
    expect(accepted.statusCode).toBe(200);
    expect((await store.getSubmissionBySlug('comet-courier'))?.jobId).not.toBe(newerJob);
    expect((await store.getSubmissionBySlug('comet-courier'))?.moderationBlockedAt).toBeUndefined();
  }
  const historical = await app.inject({ method: 'GET', url, headers: session(RECIPIENT) });
  expect(historical.statusCode).toBe(404);
  const current = await app.inject({ method: 'GET', url: '/api/drafts/comet-courier', headers: session(RECIPIENT) });
  expect(current.statusCode).toBe(404);
  const owner = await app.inject({ method: 'GET', url, headers: session(SENDER) });
  expect(owner.statusCode).toBe(200);
});

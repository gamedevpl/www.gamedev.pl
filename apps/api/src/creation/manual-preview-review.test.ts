import { expect, it, vi } from 'vitest';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';

it('lets the creator seal a green manual preview through the authenticated status flow', async () => {
  const store = new InMemoryStore();
  const uid = 'g:creator';
  const sessionSecret = 'manual-preview-session';
  const submissionTokenSecret = 'manual-preview-submission';
  await store.upsertUser({ uid });
  await store.createSubmission(9, uid, 'Manual preview');
  await store.setSubmissionSlug(9, 'manual-preview');
  await store.recordJobTransition(9, {
    to: 'building',
    at: new Date().toISOString(),
    by: 'creator',
    reason: 'channel_signal',
  });
  await store.setSubmissionPreviewVersion(9, 'preview-v1');
  await store.incrementRoundDeliveryCount(9);
  const putCandidateSources = vi.fn(async () => ({ version: 'sealed-v2' }));
  const onSourcesDelivered = vi.fn(async () => ({ buildId: 'seal-gate' }));
  const gamesStore = {
    getManifest: async () => ({
      roundGeneration: 1,
      sourceFiles: ['game.ts'],
      previewGate: { green: true, ranAt: new Date().toISOString() },
    }),
    getSourceFile: async () => 'export const boot = 1;',
    putCandidateSources,
  } as unknown as GamesStore;
  const app = await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubToken: 'test-token',
      githubClient: {} as GitHubClient,
      submissionTokenSecret,
      managedAvailabilityGate: null,
      agentChannel: { gamesStore, onSourcesDelivered },
    },
  });
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
  const url = `/api/submissions/${mintToken(9, submissionTokenSecret)}`;
  try {
    const status = await app.inject({ method: 'GET', url, headers });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ phase: 'ready_for_review', canSeal: true });
    expect(status.json().stall).toBeUndefined();
    expect((await store.getSubmission(9))?.dispatch).toBeUndefined();

    const seal = await app.inject({ method: 'POST', url: `${url}/seal`, headers });
    expect(seal.statusCode).toBe(200);
    expect(seal.json()).toEqual({ ok: true, version: 'sealed-v2' });
    expect(putCandidateSources).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ jobId: 9, origin: 'seal', mode: 'publish' }),
    );
    expect(onSourcesDelivered).toHaveBeenCalledExactlyOnceWith({
      jobId: 9,
      slug: 'manual-preview',
      version: 'sealed-v2',
    });
    expect(await store.getSubmission(9)).toMatchObject({ state: 'submitted', deliveredVersion: 'sealed-v2' });
    expect(await store.getPublication('manual-preview')).toBeNull();
  } finally {
    await app.close();
  }
});

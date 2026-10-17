import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamesStore, StagedSourceEntry } from '../delivery/games-store.js';
import type { SourceDeliveryService } from '../delivery/source-delivery.js';
import { InMemoryStore } from '../platform/store.js';
import { registerCreatorCodeRoutes } from './creator-code.js';

const slug = 'sky-dodge';
const url = `/api/me/studio/games/${slug}/sources/deliver`;
const baseFiles = [{ path: 'game.ts', content: 'export const boot = 1;' }];
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(closed = true) {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, slug);
  await store.setSubmissionLocale(10, 'pl');
  await store.setSubmissionDeliveredVersion(10, 'base');
  await store.ensureRoundGeneration(10);
  if (closed) await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  const getManifest = vi.fn(async () => ({ sourceFiles: ['game.ts'], authorship: 'agent' }));
  const staging: {
    contents: Awaited<ReturnType<GamesStore['getStagedSourceFiles']>>;
    files: StagedSourceEntry[];
  } = { contents: [], files: [] };
  const getStagedSourceFiles = vi.fn(async () => staging.contents);
  const listStagedSources = vi.fn(async () => ({
    files: staging.files,
    totalBytes: 0,
    maxBytes: 1_000_000,
    maxFiles: 100,
    updatedAt: null,
  }));
  const clearStagedSources = vi.fn<GamesStore['clearStagedSources']>(async (input) => {
    if (input.jobId !== 10) return { cleared: 0 };
    const paths = new Set(input.paths ?? staging.files.map((file) => file.path));
    const cleared = staging.files.filter((file) => paths.has(file.path)).length;
    staging.contents = staging.contents.filter((file) => !paths.has(file.path));
    staging.files = staging.files.filter((file) => !paths.has(file.path));
    return { cleared };
  });
  const gamesStore = {
    getManifest,
    getSourceFile: vi.fn(async () => baseFiles[0].content),
    getStagedSourceFiles,
    listStagedSources,
    clearStagedSources,
  } as unknown as GamesStore;
  const deliver = vi.fn<SourceDeliveryService['deliver']>(async (input) => ({
    accepted: true,
    slug,
    version: 'new',
    mode: input.mode,
    gateStarted: true,
  }));
  const invalidateStatusCache = vi.fn();
  const app = Fastify();
  apps.push(app);
  app.addHook('preHandler', async (request) => {
    request.user = { uid: request.headers['x-test-uid'] ?? 'g:creator' } as typeof request.user;
  });
  await registerCreatorCodeRoutes(app, {
    store,
    gamesStore,
    sourceDelivery: { deliver },
    invalidateStatusCache,
  });
  return {
    app,
    store,
    deliver,
    getManifest,
    getStagedSourceFiles,
    listStagedSources,
    clearStagedSources,
    invalidateStatusCache,
    staging,
  };
}

describe('delivery without staging on a closed round', () => {
  it.each(['preview', 'publish'] as const)('opens a fresh round for unchanged sources in %s mode', async (mode) => {
    const { app, store, deliver, getStagedSourceFiles, listStagedSources, clearStagedSources, invalidateStatusCache } =
      await setup();
    const response = await app.inject({ method: 'POST', url, payload: { mode, attestation: true } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: true, mode, roundOpened: expect.any(Number) });
    const jobId = response.json().roundOpened as number;
    expect(jobId).not.toBe(10);
    expect(await store.getSubmission(jobId)).toMatchObject({
      slug,
      ownerUid: 'g:creator',
      locale: 'pl',
      previewVersion: 'base',
      state: 'queued',
    });
    expect((await store.getSubmission(10))?.state).toBe('published');
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      jobId,
      slug,
      files: baseFiles,
      mode,
      authorship: 'agent',
      actor: 'creator',
      actorUid: 'g:creator',
    });
    expect(getStagedSourceFiles).toHaveBeenCalledExactlyOnceWith({ slug, jobId: 10, roundGeneration: 1 });
    expect(listStagedSources).toHaveBeenCalledExactlyOnceWith({ slug, jobId: 10, roundGeneration: 1 });
    expect(clearStagedSources).toHaveBeenCalledExactlyOnceWith({ slug, jobId, roundGeneration: 1 });
    expect(invalidateStatusCache).toHaveBeenCalledExactlyOnceWith(jobId);

    const retry = await app.inject({ method: 'POST', url, payload: { mode, attestation: true } });
    expect(retry.statusCode).toBe(429);
    expect(await store.listSubmissionsBySlug(slug)).toHaveLength(2);
    expect(deliver).toHaveBeenCalledOnce();
  });

  it.each(
    (['preview', 'publish'] as const).flatMap((mode) =>
      (['owner', 'agent', undefined] as const).map((stagedBy) => ({ mode, stagedBy })),
    ),
  )(
    'preserves closed-round edits and deletions until explicitly discarded ($mode, $stagedBy)',
    async ({ mode, stagedBy }) => {
      for (const deleted of [false, true]) {
        const { app, store, deliver, staging, clearStagedSources } = await setup();
        staging.files.push({ path: 'game.ts', bytes: 0, stagedBy, ...(deleted ? { deleted: true } : {}) });
        staging.contents.push({ path: 'game.ts', content: 'unsent edit', ...(deleted ? { deleted: true } : {}) });
        const before = await app.inject({ method: 'GET', url: url.replace('/deliver', '') });
        expect(before.statusCode).toBe(200);
        expect(before.json().deleted).toEqual(deleted ? ['game.ts'] : []);
        expect(before.json().files).toEqual(
          deleted
            ? []
            : [expect.objectContaining({ path: 'game.ts', content: 'unsent edit', stagedBy: stagedBy ?? 'agent' })],
        );

        const refused = await app.inject({ method: 'POST', url, payload: { mode, attestation: true } });
        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({
          error: 'closed_round_staging',
          message: expect.stringContaining('staged changes'),
        });
        expect(deliver).not.toHaveBeenCalled();
        expect(clearStagedSources).not.toHaveBeenCalled();
        expect(await store.listSubmissionsBySlug(slug)).toHaveLength(1);
        const after = await app.inject({ method: 'GET', url: url.replace('/deliver', '') });
        expect(after.json()).toEqual(before.json());

        const discarded = await app.inject({
          method: 'POST',
          url: url.replace('/deliver', '/stage/discard'),
          payload: {},
        });
        expect(discarded.statusCode).toBe(200);
        expect(discarded.json()).toEqual({ cleared: 1 });
        const clean = await app.inject({ method: 'GET', url: url.replace('/deliver', '') });
        expect(clean.json().files).toEqual([expect.objectContaining(baseFiles[0])]);
        expect(clean.json().deleted).toEqual([]);
        const retried = await app.inject({ method: 'POST', url, payload: { mode, attestation: true } });
        expect(retried.statusCode).toBe(200);
        expect(deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ files: baseFiles, mode }));
      }
    },
  );

  it('keeps agent staging protected while a round is still open', async () => {
    const { app, staging, clearStagedSources } = await setup(false);
    staging.files.push({ path: 'game.ts', bytes: 0, stagedBy: 'agent' });
    staging.contents.push({ path: 'game.ts', content: 'agent edit' });
    const discarded = await app.inject({ method: 'POST', url: url.replace('/deliver', '/stage/discard'), payload: {} });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json()).toEqual({ cleared: 0 });
    expect(clearStagedSources).not.toHaveBeenCalled();
    expect(staging.contents).toEqual([{ path: 'game.ts', content: 'agent edit' }]);
  });

  it('does not open a round for invalid requests or another user', async () => {
    const { app, store, deliver } = await setup();
    const invalid = await app.inject({ method: 'POST', url, payload: { mode: 'publish' } });
    expect(invalid.statusCode).toBe(400);
    const unauthorized = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-test-uid': 'g:other' },
      payload: { mode: 'publish', attestation: true },
    });
    expect(unauthorized.statusCode).toBe(404);
    expect(await store.listSubmissionsBySlug(slug)).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('does not open a round when there are no delivered sources', async () => {
    const { app, store, deliver, getManifest } = await setup();
    getManifest.mockResolvedValue({ sourceFiles: [], authorship: 'agent' });
    const response = await app.inject({ method: 'POST', url, payload: { mode: 'publish', attestation: true } });
    expect(response.statusCode).toBe(400);
    expect(await store.listSubmissionsBySlug(slug)).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('refuses delivery if another action holds the round-opening lease', async () => {
    const { app, store, deliver } = await setup();
    expect(await store.beginCheckoutRecovery(slug, 'other-action', Date.now())).toBe(true);
    const response = await app.inject({ method: 'POST', url, payload: { mode: 'publish', attestation: true } });
    expect(response.statusCode).toBe(409);
    expect(await store.listSubmissionsBySlug(slug)).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
  });
});

import Fastify from 'fastify';
import { registerSeedDispatchRoute } from './seed-dispatch.js';
import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintAgentToken } from '../platform/agent-token.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';
import { createSeedPipeline } from './seed-pipeline.js';
import type { GameSeeder, SeedDraft } from './game-seed.js';

const JOB = 42;
const draft: SeedDraft = {
  slug: 'original-game',
  files: [],
  references: [],
  usage: { model: 'fixture', inputTokens: 1, outputTokens: 1 },
  elapsedMs: 1,
  compiles: true,
  repaired: false,
};
async function fixture() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:owner' });
  await store.createSubmission(JOB, 'g:owner', 'Original');
  await store.setSubmissionSlug(JOB, 'original-game');
  await store.ensureRoundGeneration(JOB);
  const spendSeedSlot = vi.fn(async () => true);
  const seed = vi.fn(async () => draft);
  const options = {
    store,
    now: Date.now,
    gameSeeder: { seed } as GameSeeder,
    seedAvailabilityGate: { seedingEnabled: async () => true, spendSeedSlot, resolveProvider: async () => 'fixture' },
    builderOf: () => 'self' as const,
    backendFor: async () => undefined,
    githubClient: null,
    publishedRef: 'fixture',
  };
  return { store, spendSeedSlot, seed, options };
}
const log = { error: vi.fn() };
it('rejects regeneration after takeover during backend resolution without spending quota', async () => {
  const { store, spendSeedSlot, seed, options } = await fixture();
  const pipeline = createSeedPipeline({
    ...options,
    backendFor: async () => {
      await store.bumpRoundGeneration(JOB);
      return undefined;
    },
  });
  await expect(pipeline.regenerateSeed({ jobId: JOB, expectedRoundGeneration: 1, log })).rejects.toMatchObject({
    statusCode: 401,
  });
  expect((await store.getSubmission(JOB))?.seedRegenerations).toBeUndefined();
  expect(spendSeedSlot).not.toHaveBeenCalled();
  expect(seed).not.toHaveBeenCalled();
});
it('rejects an old queued regeneration before its paid call', async () => {
  const { store, spendSeedSlot, seed, options } = await fixture();
  await store.bumpRoundGeneration(JOB);
  await expect(
    createSeedPipeline(options).runSeedRegeneration({ jobId: JOB, expectedRoundGeneration: 1, log }),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(spendSeedSlot).not.toHaveBeenCalled();
  expect(seed).not.toHaveBeenCalled();
});
it('preserves the replacement seed after takeover during generation', async () => {
  const { store, options } = await fixture();
  const replacement = { slug: 'original-game', files: [{ path: 'game.ts', content: 'new round' }], references: [] };
  const pipeline = createSeedPipeline({
    ...options,
    gameSeeder: {
      seed: async () => {
        await store.bumpRoundGeneration(JOB);
        await store.setSubmissionSeed(JOB, replacement);
        return draft;
      },
    } as GameSeeder,
  });
  await expect(pipeline.runSeedRegeneration({ jobId: JOB, expectedRoundGeneration: 1, log })).rejects.toMatchObject({
    statusCode: 401,
  });
  expect((await store.getSubmission(JOB))?.seed).toEqual(replacement);
});
it('writes the seed for the captured current generation', async () => {
  const { store, options } = await fixture();
  await createSeedPipeline(options).runSeedRegeneration({ jobId: JOB, expectedRoundGeneration: 1, log });
  expect((await store.getSubmission(JOB))?.seed).toMatchObject({ slug: draft.slug, files: draft.files });
});

it('keeps the authenticated generation during the staging read', async () => {
  const { store, seed, options, spendSeedSlot } = await fixture();
  await store.setRoundBuilder(JOB, 'self');
  const app = await buildApp({
    store,
    submissionRoutes: {
      submissionTokenSecret: 'fixture-secret',
      gameSeeder: options.gameSeeder,
      seedAvailabilityGate: options.seedAvailabilityGate,
      agentChannel: {
        gamesStore: {
          listStagedSources: async () => {
            await store.bumpRoundGeneration(JOB);
            return { files: [], totalBytes: 0, maxBytes: 10000, maxFiles: 60, updatedAt: null };
          },
        } as unknown as GamesStore,
      },
    },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: { authorization: `Bearer ${mintAgentToken(JOB, 'fixture-secret', { roundGeneration: 1 })}` },
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    expect((await store.getSubmission(JOB))?.seedRegenerations).toBeUndefined();
    expect(seed).not.toHaveBeenCalled();
    expect(spendSeedSlot).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it('carries the captured generation through the queued seed route', async () => {
  const app = Fastify();
  const regenerateSeedNow = vi.fn(async () => undefined);
  await registerSeedDispatchRoute(app, {
    dispatchQueuedJob: async () => ({ outcome: 'skipped' }),
    regenerateSeedNow,
    internalAuthVerifier: { verify: async () => true },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/seed',
      payload: { jobId: JOB, action: 'regenerate', expectedRoundGeneration: 7 },
    });
    expect(response.statusCode).toBe(202);
    expect(regenerateSeedNow).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB, expectedRoundGeneration: 7 }));
  } finally {
    await app.close();
  }
});

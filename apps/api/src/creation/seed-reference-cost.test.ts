import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createSeedPipeline } from './seed-pipeline.js';
import { buildCostReport } from './job-costs.js';
import type { SeedDraft, SeedUsage } from './game-seed.js';

const filterUsage: SeedUsage = {
  model: 'gemini-3.5-flash-lite',
  provider: 'vertex',
  inputTokens: 100,
  outputTokens: 50,
};

for (const completes of [false, true]) {
  it(`records the selector model separately when generation ${completes ? 'succeeds' : 'fails'}`, async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.createSubmission(42, 'g:owner', 'Example');
    await store.setSubmissionSlug(42, 'example');
    const draft: SeedDraft = {
      slug: 'example',
      files: [],
      references: [],
      usage: { model: 'gemini-3.8-flash', provider: 'vertex', inputTokens: 1000, outputTokens: 200 },
      elapsedMs: 1,
      compiles: true,
      repaired: false,
      typeChecked: false,
      typeErrors: 0,
    };
    const pipeline = createSeedPipeline({
      store,
      now: Date.now,
      gameSeeder: {
        seed: async (request) => {
          await request.onReferenceFilterUsage?.(filterUsage);
          return completes ? draft : null;
        },
      },
      seedAvailabilityGate: {
        seedingEnabled: async () => true,
        spendSeedSlot: async () => true,
        resolveProvider: async () => 'vertex',
      },
      builderOf: () => 'self',
      backendFor: async () => undefined,
      githubClient: null,
      publishedRef: 'fixture',
    });
    await pipeline.seedBuild({
      jobId: 42,
      slug: 'example',
      spec: 'Example',
      delivery: 'channel',
      log: { error: vi.fn() },
    });
    const record = (await store.getSubmission(42))!;
    const costs = record.costs ?? [];
    expect(costs).toHaveLength(completes ? 2 : 1);
    expect(costs[0]).toMatchObject({
      kind: 'seed_selection',
      by: 'gemini-3.5-flash-lite',
      tokens: { input: 100, output: 50 },
    });
    const report = buildCostReport([record]);
    expect(report.jobs[0].seeded).toBe(completes);
    expect(report.totals.seededJobs).toBe(completes ? 1 : 0);
    expect(report.totals.tokens).toEqual(completes ? { input: 1100, output: 250 } : { input: 100, output: 50 });
    if (completes)
      expect(costs[1]).toMatchObject({ kind: 'seed', by: 'gemini-3.8-flash', tokens: { input: 1000, output: 200 } });
  });
}

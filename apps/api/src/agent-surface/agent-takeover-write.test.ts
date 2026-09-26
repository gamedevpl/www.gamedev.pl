import { expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { buildApp } from '../platform/app.js';
import { mintAgentToken } from '../platform/agent-token.js';
import type { GamesStore } from '../delivery/games-store.js';
import { createSourceDeliveryService } from '../delivery/source-delivery.js';
import { NoopTranslator } from '../platform/translate.js';

const JOB = 42;
const AT = '2026-09-26T12:00:00.000Z';
const factories = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
] as const;
async function seed(store: Store) {
  await store.upsertUser({ uid: 'g:owner' });
  await store.createSubmission(JOB, 'g:owner', 'Original');
  await store.setSubmissionSlug(JOB, 'original-game');
  await store.ensureRoundGeneration(JOB);
}
const mutations: Array<[string, (store: Store) => Promise<unknown>]> = [
  ['progress', (store) => store.appendBuildEvent(JOB, { kind: 'step', text: 'old progress' }, { roundGeneration: 1 })],
  ['presence', (store) => store.touchLastAgentSignalAt(JOB, AT, { key: 'staging_sources' }, { roundGeneration: 1 })],
  ['end', (store) => store.markAgentEnded(JOB, AT, 'end', 1)],
  ['handoff acknowledgement', (store) => store.acknowledgeBuilderHandoff(JOB, AT, 1)],
  [
    'inbox acknowledgement',
    async (store) => {
      const pending = await store.listPendingCreatorMessages(JOB);
      return store.markCreatorMessagesDelivered(
        JOB,
        pending.map((row) => row.id),
        1,
      );
    },
  ],
  ['screenshot', (store) => store.appendBuildShot(JOB, { data: 'AAAA' }, 1)],
  ['preview', (store) => store.appendBuildPreview(JOB, { data: 'AAAA' }, 1)],
  ['slug', (store) => store.setSubmissionSlug(JOB, 'other-game', undefined, 1)],
  ['title', (store) => store.setSubmissionTitle(JOB, 'Old title', 1)],
  ['preview version', (store) => store.setSubmissionPreviewVersion(JOB, 'old-v', 1)],
  ['published candidate', (store) => store.setSubmissionDeliveredVersion(JOB, 'old-v', 1)],
  ['submit counter', (store) => store.incrementRoundSubmitAttempts(JOB, 1)],
  ['delivery counter', (store) => store.incrementRoundDeliveryCount(JOB, 1)],
  ['preflight counter', (store) => store.incrementRoundPreflightRefusal(JOB, 'audio', 1)],
  ['typecheck counter', (store) => store.incrementRoundTypecheckPreflightRefusals(JOB, 1)],
  ['typecheck bypass', (store) => store.setRoundTypecheckPreflightBypassErrors(JOB, 'old errors', 1)],
];
for (const [name, factory] of factories) {
  it.each(mutations)(`${name} refuses stale %s at the write boundary`, async (_mutation, mutate) => {
    const store = factory();
    await seed(store);
    await store.appendCreatorMessage(JOB, 'New round request');
    await store.bumpRoundGeneration(JOB);
    const before = await store.getSubmission(JOB);
    await expect(mutate(store)).rejects.toMatchObject({ statusCode: 401 });
    expect(await store.getSubmission(JOB)).toEqual(before);
    expect(await store.listBuildEvents(JOB)).toEqual([]);
    expect(await store.listBuildShots(JOB)).toEqual([]);
    expect(await store.listBuildPreviews(JOB)).toEqual([]);
    expect(await store.listPendingCreatorMessages(JOB)).toHaveLength(1);
  });
}

function latch() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}
it('does not apply staging activity after takeover during source storage', async () => {
  const store = new InMemoryStore();
  await seed(store);
  const entered = latch();
  const upload = latch();
  const onSourcesStaged = vi.fn();
  const gamesStore = {
    putStagedSourceFile: async () => {
      entered.release();
      await upload.pending;
      return { path: 'game.ts', bytes: 10, files: 1, totalBytes: 10, maxBytes: 100000, maxFiles: 60, updatedAt: AT };
    },
  } as unknown as GamesStore;
  const app = await buildApp({
    store,
    submissionRoutes: { submissionTokenSecret: 'fixture-secret', agentChannel: { gamesStore, onSourcesStaged } },
  });
  try {
    const response = app.inject({
      method: 'PUT',
      url: '/api/agent/build/sources/stage',
      headers: { authorization: `Bearer ${mintAgentToken(JOB, 'fixture-secret', { roundGeneration: 1 })}` },
      payload: { path: 'game.ts', content: 'export {};', slug: 'original-game' },
    });
    const completed = Promise.resolve(response);
    await entered.pending;
    await store.bumpRoundGeneration(JOB);
    await store.markAgentEnded(JOB, AT, 'submit');
    const before = await store.getSubmission(JOB);
    upload.release();
    expect((await completed).statusCode).toBe(401);
    expect(await store.getSubmission(JOB)).toEqual(before);
    expect(onSourcesStaged).not.toHaveBeenCalled();
  } finally {
    upload.release();
    await app.close();
  }
});
it('does not attach an uploaded old candidate to a replacement round', async () => {
  const store = new InMemoryStore();
  await seed(store);
  const entered = latch();
  const upload = latch();
  const gate = vi.fn();
  const service = createSourceDeliveryService({
    store,
    gamesStore: {
      putCandidateSources: async () => {
        entered.release();
        await upload.pending;
        return { version: 'old-candidate', manifest: {} };
      },
    } as unknown as GamesStore,
    translator: new NoopTranslator(),
    parseSpecTitle: () => 'Old title',
    runTypecheckPreflight: async () => ({ ok: true }),
    sharedSourcesFromKitTree: () => ({}),
    typecheckPreflightMaxRefusals: 3,
    onSourcesDelivered: gate,
  });
  const completion = service.deliver({
    jobId: JOB,
    slug: 'original-game',
    mode: 'preview',
    expectedRoundGeneration: 1,
    files: [
      { path: 'SPEC.md', content: '---\ntitle: Old title\n---' },
      { path: 'game.ts', content: 'export {};' },
    ],
  });
  const observed = completion.catch((error: unknown) => error);
  await entered.pending;
  await store.bumpRoundGeneration(JOB);
  const before = await store.getSubmission(JOB);
  upload.release();
  expect(await observed).toMatchObject({ statusCode: 401 });
  expect(await store.getSubmission(JOB)).toEqual(before);
  expect(gate).not.toHaveBeenCalled();
});

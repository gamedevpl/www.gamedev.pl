import { fakeFirestore } from '../store/fake-firestore.js';
import { expect, it, vi } from 'vitest';
import { InMemoryStore, FirestoreStore } from '../platform/store.js';
import { createShareDraftTools } from './mcp-share-draft-tools.js';
import { refuseShareOf } from '../delivery/draft-share-gate.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { ToolContext } from './mcp-tool-support.js';

function latch() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

it.each([true, false])('does not apply a stale MCP share toggle after takeover (shared: %s)', async (shared) => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'owner' });
  await store.createSubmission(42, 'owner', 'Game');
  await store.setSubmissionSlug(42, 'game');
  await store.setSubmissionDeliveredVersion(42, 'v1');
  await store.ensureRoundGeneration(42);
  const previous = shared ? undefined : '2026-09-27T00:00:00.000Z';
  if (previous) await store.setDraftShared(42, previous);
  const record = (await store.getSubmission(42))!;
  const original = store.setDraftShared.bind(store);
  const entered = latch();
  const commit = latch();
  vi.spyOn(store, 'setDraftShared').mockImplementation(async (...args) => {
    entered.release();
    await commit.pending;
    return original(...args);
  });
  const gamesStore = { getManifest: async () => ({ gate: { green: true } }) } as unknown as GamesStore;
  const tools = createShareDraftTools({
    store,
    now: Date.now,
    resolveAuth: async () => ({ jobId: 42, record, actorUid: 'owner' }),
    refuseShare: () => refuseShareOf({ gamesStore, slug: 'game', version: 'v1' }),
  });
  const response = tools.share_draft.handler({ shared }, {} as ToolContext);
  await entered.pending;
  await store.bumpRoundGeneration(42);
  commit.release();
  await expect(response).rejects.toMatchObject({ statusCode: 401 });
  expect((await store.getSubmission(42))?.draftSharedAt).toBe(previous);
});

it.each([
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
] as const)('allows the current generation to share and unshare (%s)', async (_kind, factory) => {
  const store = factory();
  await store.createSubmission(42, 'owner', 'Game');
  await store.ensureRoundGeneration(42);
  await store.setDraftShared(42, '2026-09-27T00:00:00.000Z', 1);
  expect((await store.getSubmission(42))?.draftSharedAt).toBe('2026-09-27T00:00:00.000Z');
  await store.setDraftShared(42, null, 1);
  expect((await store.getSubmission(42))?.draftSharedAt).toBeUndefined();
});

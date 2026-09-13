import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { saveRemixAsStudioDraft } from './remix-save.js';

it('retries a remix slug when recovery wins after the availability probe', async () => {
  const store = new InMemoryStore();
  const original = store.claimSubmissionSlug.bind(store);
  vi.spyOn(store, 'claimSubmissionSlug').mockImplementationOnce(async (...args) => {
    const other = await store.allocateJobId();
    await store.createSubmission(other, 'other', 'Recovered');
    expect(await original(other, args[1], null, { key: 'recovery', spec: 'local', locale: 'en' })).toBe(true);
    return original(...args);
  });
  const result = await saveRemixAsStudioDraft({
    store,
    uid: 'owner',
    ip: '127.0.0.1',
    parentSlug: 'parent',
    parentTitle: 'Parent',
    title: 'Remix Race',
    sources: { 'SPEC.md': 'Game', 'game.ts': 'export {}', 'index.html': '<html></html>' },
    html: '<html></html>',
    definition: null,
    submissionTokenSecret: 'secret',
    log: { error: vi.fn() },
    gamesStore: {
      putCandidateSources: async () => ({ version: 'v1', manifest: { version: 'v1' } }),
      putDerivedArtifact: async () => {},
    } as unknown as GamesStore,
  });
  expect(result).toMatchObject({ ok: true, slug: 'remix-race-2' });
  expect((await store.getSubmissionBySlug('remix-race'))?.ownerUid).toBe('other');
  expect((await store.getSubmissionBySlug('remix-race-2'))?.ownerUid).toBe('owner');
});

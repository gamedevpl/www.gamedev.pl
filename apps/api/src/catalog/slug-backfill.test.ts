import { describe, expect, it } from 'vitest';

import { runSlugBackfill } from './slug-backfill.js';
import { InMemoryStore } from '../platform/store.js';

// The HTTP route's own tests live in submissions.test.ts. These cover the shared loop
// directly, because the `slug:backfill` CLI reaches it without a server and its probe
// answers from the store alone — the paths differ in what "taken" means, not in the
// naming.
describe('slug backfill', () => {
  /** The store half of `isSlugClaimed`, which is all the CLI has. */
  const storeProbe =
    (store: InMemoryStore) =>
    async (slug: string, except?: number): Promise<boolean> => {
      const existing = await store.getSubmissionBySlug(slug);
      if (existing && existing.jobId !== except) return true;
      return Boolean(await store.getPublication(slug));
    };

  async function storeWithTitles(titles: string[]) {
    const store = new InMemoryStore();
    let jobId = 500;
    // A record with no slug is exactly what the flow used to write, and what every game
    // predating minting-at-submission still looks like.
    for (const title of titles) await store.createSubmission(jobId++, 'g:creator', title);
    return store;
  }

  it('names every slug-less game after its title', async () => {
    const store = await storeWithTitles(['Space Miner', 'Łódź Nights']);

    const result = await runSlugBackfill({ store, isSlugClaimed: storeProbe(store), dryRun: false });

    expect(result).toMatchObject({ ok: true, dryRun: false, scanned: 2, named: 2, failed: 0 });
    expect((await store.getSubmission(500))?.slug).toBe('space-miner');
    expect((await store.getSubmission(501))?.slug).toBe('lodz-nights');
  });

  it('writes nothing when rehearsing, and still refuses to promise one name twice', async () => {
    const store = await storeWithTitles(['Space Miner', 'Space Miner']);

    const result = await runSlugBackfill({ store, isSlugClaimed: storeProbe(store), dryRun: true });

    expect(result).toMatchObject({ dryRun: true, scanned: 2, named: 2, failed: 0 });
    expect(result.games.map((game) => game.slug)).toEqual(['space-miner', 'space-miner-2']);
    expect((await store.getSubmission(500))?.slug).toBeUndefined();
    expect((await store.getSubmission(501))?.slug).toBeUndefined();
  });

  it('leaves an abandoned build unnamed — its creator stopped it', async () => {
    const store = await storeWithTitles(['Space Miner']);
    await store.setSubmissionAbandoned(500, new Date().toISOString());

    const result = await runSlugBackfill({ store, isSlugClaimed: storeProbe(store), dryRun: true });

    expect(result).toMatchObject({ scanned: 0, games: [] });
  });

  it('does not hand a backlog game a name a published game already answers to', async () => {
    const store = await storeWithTitles(['Space Miner']);
    await store.setPublication({
      slug: 'space-miner',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: new Date().toISOString(),
    });

    const result = await runSlugBackfill({ store, isSlugClaimed: storeProbe(store), dryRun: true });

    expect(result.games[0]?.slug).toBe('space-miner-2');
  });
});

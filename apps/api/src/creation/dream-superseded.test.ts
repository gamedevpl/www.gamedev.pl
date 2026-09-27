import { expect, it } from 'vitest';
import { harness } from './dream-job.harness.js';

it('records superseded completion when closure changes the claimed generation', async () => {
  const { store, run } = await harness({ hud: [] });
  const read = store.getPublishedSubmissionBySlug.bind(store);
  store.getPublishedSubmissionBySlug = async (slug) => {
    await store.bumpRoundGeneration(7);
    return read(slug);
  };
  expect(await run()).toBe('superseded');
  expect((await store.getSubmission(7))?.dreamRun).toMatchObject({ superseded: true, endedAt: expect.any(String) });
});

import { expect, it } from 'vitest';
import { harness } from './dream-job.harness.js';
import { runDreamWorker } from './dream-worker.js';

it.each(['before-read', 'before-claim'])('rejects a replacement round opened %s', async (when) => {
  const { store, job, ideas, frames } = await harness({ hud: [] });
  const expectedRoundGeneration = (await store.getSubmission(7))!.roundGeneration ?? 1;
  if (when === 'before-read') await store.bumpRoundGeneration(7);
  else {
    const claim = store.claimDreamRun.bind(store);
    store.claimDreamRun = async (...args) => {
      await store.bumpRoundGeneration(7);
      return claim(...args);
    };
  }
  expect(
    await runDreamWorker(store, job, {
      jobId: 7,
      version: 'v1',
      expectedRoundGeneration,
      screenshotPath: 'media/opening.png',
    }),
  ).toMatch(/superseded|already_ran/);
  expect(ideas.requests).toEqual([]);
  expect(frames.requests).toEqual([]);
  expect((await store.getSubmission(7))?.dreamRun).toBeUndefined();
});

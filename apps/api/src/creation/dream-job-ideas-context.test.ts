import { describe, expect, it } from 'vitest';
import { harness } from './dream-job.harness.js';
import { DEFAULT_NEXT_IDEAS_MODEL, NEXT_IDEAS_GEMINI_MODEL } from './next-ideas.js';

describe('createDreamJob ideas context', () => {
  it('shows the idea model the capture and what the rounds built', async () => {
    const { store, ideas, run } = await harness({ hud: [] });
    await store.appendCreatorMessage(7, 'Add a second moon');
    expect(await run()).toBe('posted');
    const request = ideas.requests[0]!;
    expect(request.screenshotPng).toBeTruthy();
    expect(request.history).toEqual(['Creator asked: Add a second moon']);
  });

  it('finishes only after every draw is in the ledger, named by its model', async () => {
    const { store, ideas, run } = await harness({ hud: [], ideas: [] });
    const record = store.recordJobCost.bind(store);
    // A slow write: an unawaited one would land after run() resolves.
    store.recordJobCost = async (jobId, entry) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await record(jobId, entry);
    };
    const generate = ideas.generate.bind(ideas);
    ideas.generate = async (params) => {
      params.onAttempt?.(NEXT_IDEAS_GEMINI_MODEL);
      return generate(params);
    };
    expect(await run()).toBe('no_ideas');
    const concept = ((await store.getSubmission(7))?.costs ?? []).filter((entry) => entry.kind === 'concept');
    expect(concept.map((entry) => entry.by)).toEqual([NEXT_IDEAS_GEMINI_MODEL, DEFAULT_NEXT_IDEAS_MODEL]);
  });
});

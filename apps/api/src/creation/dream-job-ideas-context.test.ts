import { describe, expect, it } from 'vitest';
import { harness } from './dream-job.harness.js';

describe('createDreamJob ideas context', () => {
  it('shows the idea model the capture and what the rounds built', async () => {
    const { store, ideas, run } = await harness({ hud: [] });
    await store.appendCreatorMessage(7, 'Add a second moon');
    expect(await run()).toBe('posted');
    const request = ideas.requests[0]!;
    expect(request.screenshotPng).toBeTruthy();
    expect(request.history).toEqual(['Creator asked: Add a second moon']);
  });
});

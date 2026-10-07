import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { dreamHistory, MAX_DREAM_HISTORY } from './dream-history.js';

describe('dreamHistory', () => {
  it('interleaves creator asks and deliveries, oldest first, without machine context', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(7, 'g:owner', 'Trench');
    await store.appendCreatorMessage(7, 'Add artillery\n\n```text\nreferenceImageShotIds: shot-a\n```');
    await store.appendBuildEvent(7, { kind: 'step', step: 'build', text: 'Working on shells' });
    const later = new Date(Date.now() + 60_000).toISOString();
    await store.appendBuildEvent(7, {
      kind: 'done',
      step: 'deliver',
      text: 'Artillery strikes on Q',
      createdAt: later,
    });
    await store.appendCreatorMessage(7, 'Studio reply', { origin: 'studio', delivered: true });
    const history = await dreamHistory(store, 7);
    expect(history).toEqual(['Creator asked: Add artillery', 'Delivered: Artillery strikes on Q']);
  });

  it(`keeps the newest ${MAX_DREAM_HISTORY}`, async () => {
    const store = new InMemoryStore();
    await store.createSubmission(7, 'g:owner', 'Trench');
    for (let index = 0; index < 12; index += 1) await store.appendCreatorMessage(7, `ask ${index}`);
    const history = await dreamHistory(store, 7);
    expect(history).toHaveLength(MAX_DREAM_HISTORY);
    expect(history.at(-1)).toBe('Creator asked: ask 11');
  });
});

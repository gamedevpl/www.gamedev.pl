import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { PAUSEABLE_LANES, lanePatch } from '../platform/spend-brake.js';

// setCreationLimits merges field by field, so a new lane can vanish.
describe('every pauseable lane survives a write', () => {
  it.each(PAUSEABLE_LANES)('%s', async (lane) => {
    const store = new InMemoryStore();
    const patch = lanePatch(lane);
    await store.setCreationLimits(patch, 'test');

    const stored = (await store.getCreationLimits()) as Record<string, unknown> | null;
    for (const [key, value] of Object.entries(patch)) {
      expect(stored?.[key], `${lane} sets ${key}`).toEqual(value);
    }
  });

  it('does not disturb the lanes it was not asked about', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits(lanePatch('video'), 'test');
    await store.setCreationLimits(lanePatch('media'), 'test');

    const stored = await store.getCreationLimits();
    expect(stored?.videoPaused).toBe(true);
    expect(stored?.mediaLean).toBe(true);
    expect(stored?.anonymousPaused).toBe(false);
  });
});

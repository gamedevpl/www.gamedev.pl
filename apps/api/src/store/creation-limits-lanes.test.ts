import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { FirestoreQuotaStore } from './slices/quota.js';
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

// The Firestore reader whitelists fields it copies.
function firestoreReading(document: Record<string, unknown>): FirestoreQuotaStore {
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => document }),
      }),
    }),
  } as unknown as Firestore;
  return new FirestoreQuotaStore(db);
}

describe('every pauseable lane survives the round trip Firestore makes', () => {
  it.each(PAUSEABLE_LANES)('%s', async (lane) => {
    const patch = lanePatch(lane) as Record<string, unknown>;
    const read = (await firestoreReading(patch).getCreationLimits()) as Record<string, unknown> | null;

    for (const [key, value] of Object.entries(patch)) {
      // A dropped lane is stored, then read back false.
      expect(read?.[key], `${lane} reads ${key} back`).toEqual(value);
    }
  });
});

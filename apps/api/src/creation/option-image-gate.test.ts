import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import {
  createOptionImageGate,
  DEFAULT_DAILY_OPTION_IMAGE_USER_CAP,
  DEFAULT_GLOBAL_DAILY_OPTION_IMAGE_CAP,
} from './creation-limits.js';

const DATE = '2026-09-22';

describe('option image gate', () => {
  it('spends a global slot per admitted request and refuses at the cap', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyOptionImageCap: 2 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-2', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-3', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('treats a cap of zero as closed, which is the pause switch', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyOptionImageCap: 0 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
    expect(await store.getGlobalOptionImageCount(DATE)).toBe(0);
  });

  it('applies the default cap when the document sets none', async () => {
    const store = new InMemoryStore();
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    for (let i = 0; i < DEFAULT_GLOBAL_DAILY_OPTION_IMAGE_CAP; i++) {
      expect((await gate.checkAndSpend(`uid-${i}`, DATE)).allowed).toBe(true);
    }
    expect(await gate.checkAndSpend('one-too-many', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('peeks without spending, so a refusal costs no vendor call', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyOptionImageCap: 1 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    expect(await gate.peek('uid-1', DATE)).toEqual({ allowed: true });
    expect(await store.getGlobalOptionImageCount(DATE)).toBe(0);

    await gate.checkAndSpend('uid-1', DATE);
    expect(await gate.peek('uid-2', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('admits the request uncounted when the counter is unreachable, rather than reading as over capacity', async () => {
    const store = new InMemoryStore();
    vi.spyOn(store, 'checkAndIncrementGlobalOptionImages').mockRejectedValue(new Error('firestore down'));
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
  });

  it('refuses a creator past their own cap while the shared day still has room', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ dailyOptionImageUserCap: 2 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });

    // Another creator is unaffected, and the shared counter only moved twice.
    expect(await gate.checkAndSpend('uid-2', DATE)).toEqual({ allowed: true });
    expect(await store.getGlobalOptionImageCount(DATE)).toBe(3);
  });

  it('does not spend a shared slot on a creator the per-creator cap already refused', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ dailyOptionImageUserCap: 1 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    await gate.checkAndSpend('uid-1', DATE);
    await gate.checkAndSpend('uid-1', DATE);

    expect(await store.getGlobalOptionImageCount(DATE)).toBe(1);
  });

  it('applies the default per-creator cap when the document sets none', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyOptionImageCap: 10_000 }, 'test');
    const gate = createOptionImageGate({ store, ttlMs: 0 });

    for (let i = 0; i < DEFAULT_DAILY_OPTION_IMAGE_USER_CAP; i++) {
      expect((await gate.checkAndSpend('uid-1', DATE)).allowed).toBe(true);
    }
    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });
});

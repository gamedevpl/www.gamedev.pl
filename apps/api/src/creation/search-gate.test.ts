import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createSearchGate, DEFAULT_GLOBAL_DAILY_SEARCH_EMBEDDING_CAP } from './creation-limits.js';

const DATE = '2026-08-30';

describe('search gate', () => {
  it('spends a global slot per admitted query and refuses at the cap', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailySearchEmbeddingCap: 2 }, 'test');
    const gate = createSearchGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-2', DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('uid-3', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('counts anonymous callers against the same global ceiling', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailySearchEmbeddingCap: 1 }, 'test');
    const gate = createSearchGate({ store, ttlMs: 0 });

    // Anonymous has no per-user counter; the global cap must hold.
    expect(await gate.checkAndSpend(null, DATE)).toEqual({ allowed: true });
    expect(await gate.checkAndSpend(null, DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('refuses while paused, without spending', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ searchPaused: true }, 'test');
    const gate = createSearchGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend(null, DATE)).toEqual({ allowed: false, reason: 'paused' });
    expect(await store.getGlobalSearchEmbeddingCount(DATE)).toBe(0);
  });

  it('treats a cap of zero as closed', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailySearchEmbeddingCap: 0 }, 'test');
    const gate = createSearchGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('applies the default cap when the document sets none', async () => {
    const store = new InMemoryStore();
    const gate = createSearchGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
    // Unset must read as the default, never unlimited.
    expect(DEFAULT_GLOBAL_DAILY_SEARCH_EMBEDDING_CAP).toBeGreaterThan(0);
  });

  it('admits and says so distinctly when the counter is unreachable', async () => {
    const store = new InMemoryStore();
    vi.spyOn(store, 'checkAndIncrementGlobalSearchEmbeddings').mockRejectedValue(new Error('firestore down'));
    const logWarn = vi.fn();
    const gate = createSearchGate({ store, ttlMs: 0, logWarn });

    expect(await gate.checkAndSpend(null, DATE)).toEqual({ allowed: true });
    // A blip must not blank search, but must stay greppable.
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({ dateStr: DATE }),
      expect.stringContaining('uncounted'),
    );
  });

  it('does not charge automation accounts', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailySearchEmbeddingCap: 1 }, 'test');
    const gate = createSearchGate({ store, ttlMs: 0 });

    expect(await gate.checkAndSpend('bot:e2e', DATE)).toEqual({ allowed: true });
    expect(await store.getGlobalSearchEmbeddingCount(DATE)).toBe(0);
    expect(await gate.checkAndSpend('uid-1', DATE)).toEqual({ allowed: true });
  });
});

describe('automation accounts', () => {
  it('spends its own allowance rather than passing unbounded', async () => {
    const store = new InMemoryStore();
    const gate = createSearchGate({ store, ttlMs: 0 });
    process.env.GLOBAL_DAILY_BOT_CALL_CAP = '2';
    try {
      expect(await gate.checkAndSpend('bot:e2e', DATE)).toEqual({ allowed: true });
      expect(await gate.checkAndSpend('bot:e2e', DATE)).toEqual({ allowed: true });
      // A looping or leaked bot credential used to be bounded by nothing.
      expect(await gate.checkAndSpend('bot:e2e', DATE)).toEqual({ allowed: false, reason: 'over_capacity' });
      // The creator allowance is untouched either way.
      expect(await store.getGlobalSearchEmbeddingCount(DATE)).toBe(0);
    } finally {
      delete process.env.GLOBAL_DAILY_BOT_CALL_CAP;
    }
  });

  it('is never stopped by a pause, so a deploy can still ship the fix', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ searchPaused: true }, 'g:boss');
    const gate = createSearchGate({ store, ttlMs: 0 });
    expect(await gate.checkAndSpend('bot:e2e', DATE)).toEqual({ allowed: true });
  });
});

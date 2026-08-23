import { describe, expect, it, vi } from 'vitest';
import {
  createChatGate,
  createCreationGate,
  createEditingGate,
  createTabCompleteGate,
  DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP,
  resolveDefaultGlobalDailyCap,
  TAB_COMPLETE_TOKEN_RESERVATION,
  type CreationGateOptions,
} from './creation-limits.js';
import { InMemoryStore, type CreationLimits, type Store } from '../platform/store.js';

const today = '2026-07-30';

/**
 * Only the four store methods the breaker touches. A partial fake rather than an
 * InMemoryStore so a test can make a *read* fail, which is the interesting case.
 */
function fakeStore(
  params: {
    limits?: CreationLimits | null;
    getLimits?: () => Promise<CreationLimits | null>;
    increment?: (dateStr: string, limit: number) => Promise<{ allowed: boolean; current: number }>;
  } = {},
) {
  let count = 0;
  const getCreationLimits = vi.fn(params.getLimits ?? (async () => params.limits ?? null));
  const checkAndIncrementGlobalSubmissions = vi.fn(
    params.increment ??
      (async (_dateStr: string, limit: number) => {
        if (count >= limit) return { allowed: false, current: count };
        count += 1;
        return { allowed: true, current: count };
      }),
  );
  return {
    store: { getCreationLimits, checkAndIncrementGlobalSubmissions } as unknown as Store,
    getCreationLimits,
    checkAndIncrementGlobalSubmissions,
  };
}

function gate(store: Store, overrides: Partial<CreationGateOptions> = {}) {
  return createCreationGate({ store, defaultGlobalDailyCap: 3, ttlMs: 60_000, ...overrides });
}

describe('resolveDefaultGlobalDailyCap', () => {
  it('treats a blank or unparseable env var as "not configured"', () => {
    // Number('') is 0, and reading that as a cap would close creation on an empty var.
    expect(resolveDefaultGlobalDailyCap(undefined, {})).toBe(DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP);
    expect(resolveDefaultGlobalDailyCap(undefined, { GLOBAL_DAILY_SUBMISSION_CAP: '  ' })).toBe(
      DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP,
    );
    expect(resolveDefaultGlobalDailyCap(undefined, { GLOBAL_DAILY_SUBMISSION_CAP: 'lots' })).toBe(
      DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP,
    );
  });

  it('honours an explicit zero, because "accept nothing" is a real intent', () => {
    expect(resolveDefaultGlobalDailyCap(undefined, { GLOBAL_DAILY_SUBMISSION_CAP: '0' })).toBe(0);
    expect(resolveDefaultGlobalDailyCap(0, {})).toBe(0);
  });

  it('prefers an explicit override over the environment', () => {
    expect(resolveDefaultGlobalDailyCap(12, { GLOBAL_DAILY_SUBMISSION_CAP: '99' })).toBe(12);
  });
});

describe('the creation breaker', () => {
  it('spends a global slot per admitted request and refuses at the ceiling', async () => {
    const fake = fakeStore();
    const breaker = gate(fake.store);

    expect(await breaker.checkAndSpend('g:one', today)).toEqual({ allowed: true });
    expect(await breaker.checkAndSpend('g:two', today)).toEqual({ allowed: true });
    expect(await breaker.checkAndSpend('g:three', today)).toEqual({ allowed: true });
    // The cap is shared, so the fourth request is refused however many people made
    // the first three — that is the whole difference from a per-user quota.
    expect(await breaker.checkAndSpend('g:four', today)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('refuses while paused without touching the counter', async () => {
    const fake = fakeStore({ limits: { paused: true, globalDailySubmissionCap: null } });

    expect(await gate(fake.store).checkAndSpend('g:one', today)).toEqual({ allowed: false, reason: 'paused' });
    expect(fake.checkAndIncrementGlobalSubmissions).not.toHaveBeenCalled();
  });

  it('reads the stored cap in preference to the deployed default', async () => {
    const fake = fakeStore({ limits: { paused: false, globalDailySubmissionCap: 1 } });
    const breaker = gate(fake.store);

    expect(await breaker.checkAndSpend('g:one', today)).toEqual({ allowed: true });
    expect(await breaker.checkAndSpend('g:two', today)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('closes on a stored cap of zero rather than reading it as "no limit"', async () => {
    const fake = fakeStore({ limits: { paused: false, globalDailySubmissionCap: 0 } });

    expect(await gate(fake.store).checkAndSpend('g:one', today)).toEqual({
      allowed: false,
      reason: 'over_capacity',
    });
  });

  it('lets bot: accounts through a closed breaker, and does not count them', async () => {
    // Pausing creation is an incident response; the deploy pipeline's own checks run as
    // bot: accounts, and losing the ability to ship a fix mid-incident is backwards.
    const fake = fakeStore({ limits: { paused: true, globalDailySubmissionCap: 0 } });

    expect(await gate(fake.store).checkAndSpend('bot:ci', today)).toEqual({ allowed: true });
    expect(fake.getCreationLimits).not.toHaveBeenCalled();
    expect(fake.checkAndIncrementGlobalSubmissions).not.toHaveBeenCalled();
  });

  it('reads the config once per TTL, then picks up a change with no restart', async () => {
    let stored: CreationLimits = { paused: false, globalDailySubmissionCap: 10 };
    let clock = 1_000_000;
    const fake = fakeStore({ getLimits: async () => stored });
    const breaker = gate(fake.store, { now: () => clock, ttlMs: 60_000 });

    expect(await breaker.checkAndSpend('g:one', today)).toEqual({ allowed: true });
    stored = { paused: true, globalDailySubmissionCap: 10 };
    // Still cached: the flip is not instant, and pretending otherwise would mean a
    // document read on every submission.
    expect(await breaker.checkAndSpend('g:two', today)).toEqual({ allowed: true });
    expect(fake.getCreationLimits).toHaveBeenCalledTimes(1);

    clock += 61_000;
    expect(await breaker.checkAndSpend('g:three', today)).toEqual({ allowed: false, reason: 'paused' });
    expect(fake.getCreationLimits).toHaveBeenCalledTimes(2);
  });

  it('serves the last known config when the read fails', async () => {
    let fail = false;
    let clock = 1_000_000;
    const fake = fakeStore({
      getLimits: async () => {
        if (fail) throw new Error('firestore unavailable');
        return { paused: true, globalDailySubmissionCap: 10 };
      },
    });
    const breaker = gate(fake.store, { now: () => clock, ttlMs: 60_000 });

    expect(await breaker.checkAndSpend('g:one', today)).toEqual({ allowed: false, reason: 'paused' });
    fail = true;
    clock += 61_000;

    // A blip must not un-pause a paused product. The value only changes when an
    // operator changes it, so stale is the correct answer.
    expect(await breaker.checkAndSpend('g:two', today)).toEqual({ allowed: false, reason: 'paused' });
  });

  it('falls back to the deployed default when the config was never readable', async () => {
    const fake = fakeStore({
      getLimits: async () => {
        throw new Error('firestore unavailable');
      },
    });
    const breaker = gate(fake.store, { defaultGlobalDailyCap: 1 });

    // Fails open to a real ceiling, not to infinity: an unreadable document must not be
    // a creation outage, but it must not be an unbounded one either.
    expect(await breaker.checkAndSpend('g:one', today)).toEqual({ allowed: true });
    expect(await breaker.checkAndSpend('g:two', today)).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('admits the request when the counter itself is unreachable', async () => {
    const logWarn = vi.fn();
    const fake = fakeStore({
      increment: async () => {
        throw new Error('firestore unavailable');
      },
    });

    // A Firestore outage is not "the site is over capacity", and the submission is
    // about to fail on its own terms anyway — it cannot be recorded either.
    expect(await gate(fake.store, { logWarn }).checkAndSpend('g:one', today)).toEqual({ allowed: true });
    expect(logWarn).toHaveBeenCalled();
  });

  it('warns before the cap trips, so a creator is not the one who discovers it', async () => {
    const logWarn = vi.fn();
    const breaker = gate(fakeStore().store, { logWarn, defaultGlobalDailyCap: 3 });

    await breaker.checkAndSpend('g:one', today);
    expect(logWarn).not.toHaveBeenCalled();
    await breaker.checkAndSpend('g:two', today);
    await breaker.checkAndSpend('g:three', today);
    expect(logWarn.mock.calls.some(([, message]) => String(message).includes('80%'))).toBe(true);
  });

  it('reports what is in force, including where it came from', async () => {
    const stored: CreationLimits = { paused: true, globalDailySubmissionCap: 7, updatedBy: 'g:admin' };
    expect(await gate(fakeStore({ limits: stored }).store).readLimits()).toMatchObject({
      paused: true,
      globalDailySubmissionCap: 7,
      updatedBy: 'g:admin',
      source: 'stored',
    });
  });
});

describe('editing gate (the remix/assist spend breaker)', () => {
  it('spends slots until the cap, then refuses with over_capacity', async () => {
    const store = new InMemoryStore();
    const gate = createEditingGate({ store, ttlMs: 0, defaultGlobalDailyCap: 2 });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:bob', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:carol', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
    // A new day is a new allowance.
    expect(await gate.checkAndSpend('g:carol', '2026-08-03')).toEqual({ allowed: true });
  });

  it('honours the stored editingPaused switch without touching creation', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ editingPaused: true }, 'operator');
    const gate = createEditingGate({ store, ttlMs: 0 });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: false, reason: 'paused' });
    // The creation side of the same document is untouched by the editing pause.
    const creation = createCreationGate({ store, ttlMs: 0, defaultGlobalDailyCap: 5 });
    expect(await creation.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
  });

  it('prefers the stored cap over the default, and lets bots through uncounted', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyEditCap: 1 }, 'operator');
    const gate = createEditingGate({ store, ttlMs: 0, defaultGlobalDailyCap: 100 });
    expect(await gate.checkAndSpend('bot:e2e', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
  });
});

describe('chat gate (the studio mini chat agent spend breaker)', () => {
  it('spends slots until the cap, then refuses with over_capacity', async () => {
    const store = new InMemoryStore();
    const gate = createChatGate({ store, ttlMs: 0, defaultGlobalDailyCap: 2 });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:bob', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:carol', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
    // A new day is a new allowance.
    expect(await gate.checkAndSpend('g:carol', '2026-08-03')).toEqual({ allowed: true });
  });

  it('honours the stored chatPaused switch without touching editing or creation', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ chatPaused: true }, 'operator');
    const gate = createChatGate({ store, ttlMs: 0 });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: false, reason: 'paused' });
    const editing = createEditingGate({ store, ttlMs: 0, defaultGlobalDailyCap: 5 });
    expect(await editing.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
  });

  it('has its own cap, independent of the editing lanes’ cap', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyEditCap: 1, globalDailyChatCap: 100 }, 'operator');
    const chat = createChatGate({ store, ttlMs: 0 });
    const editing = createEditingGate({ store, ttlMs: 0 });
    // The edit cap is already spent...
    expect(await editing.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
    expect(await editing.checkAndSpend('g:bob', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
    // ...but chat has its own, much larger, untouched budget.
    expect(await chat.checkAndSpend('g:bob', '2026-08-02')).toEqual({ allowed: true });
  });

  it('lets bots through uncounted', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyChatCap: 1 }, 'operator');
    const gate = createChatGate({ store, ttlMs: 0 });
    expect(await gate.checkAndSpend('bot:e2e', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('bot:e2e', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
    expect(await gate.checkAndSpend('g:bob', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
  });
});

describe('tab-complete gate (the ghost-text token breaker)', () => {
  it('reserves a worst-case slot on peek, so a burst cannot all pass free', async () => {
    const store = new InMemoryStore();
    // Room for exactly one reservation, not two.
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: TAB_COMPLETE_TOKEN_RESERVATION });
    expect(await gate.peek('g:alice', '2026-08-02')).toEqual({ allowed: true, reserved: true });
    expect(await gate.peek('g:bob', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('refuses a reservation that would itself cross a cap smaller than one reservation', async () => {
    const store = new InMemoryStore();
    // A cap below one reservation must still refuse.
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: 100 });
    expect(await gate.peek('g:alice', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
    expect(await store.getGlobalTabCompleteTokenCount('2026-08-02')).toBe(0);
  });

  it('gives back the unused reservation once real usage is known', async () => {
    const store = new InMemoryStore();
    // Room for one reservation plus headroom for the next.
    const cap = TAB_COMPLETE_TOKEN_RESERVATION + 500;
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: cap });
    const peeked = await gate.peek('g:alice', '2026-08-02');
    expect(peeked).toEqual({ allowed: true, reserved: true });
    await gate.spend('g:alice', '2026-08-02', 100, peeked.allowed && peeked.reserved);
    // Reservation released down to real usage; a second request has room again.
    expect(await gate.peek('g:bob', '2026-08-02')).toEqual({ allowed: true, reserved: true });
  });

  it('tops up the counter when real usage exceeds the reservation', async () => {
    const store = new InMemoryStore();
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: TAB_COMPLETE_TOKEN_RESERVATION + 10 });
    expect(await gate.peek('g:alice', '2026-08-02')).toEqual({ allowed: true, reserved: true });
    await gate.spend('g:alice', '2026-08-02', TAB_COMPLETE_TOKEN_RESERVATION + 10, true);
    expect(await gate.peek('g:bob', '2026-08-02')).toEqual({ allowed: false, reason: 'over_capacity' });
  });

  it('releasing a reservation never drops the counter below zero', async () => {
    const store = new InMemoryStore();
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: 5_000 });
    // spend() with no prior peek must not underflow the day's counter.
    await gate.spend('g:alice', '2026-08-02', 0, false);
    expect(await store.getGlobalTabCompleteTokenCount('2026-08-02')).toBe(0);
  });

  it('does not release a reservation that was never actually recorded', async () => {
    const store = new InMemoryStore();
    let failNextIncrement = true;
    const originalIncrement = store.checkAndIncrementGlobalTabCompleteTokens.bind(store);
    store.checkAndIncrementGlobalTabCompleteTokens = async (dateStr, tokens, limit) => {
      if (failNextIncrement) {
        failNextIncrement = false;
        throw new Error('firestore unavailable');
      }
      return originalIncrement(dateStr, tokens, limit);
    };
    const gate = createTabCompleteGate({ store, ttlMs: 0, defaultGlobalDailyCap: 500, logWarn: () => {} });

    // The reservation write failed, so peek() admits without reserving.
    const peeked = await gate.peek('g:alice', '2026-08-02');
    expect(peeked).toEqual({ allowed: true, reserved: false });
    // A naive spend() would underflow to 0 instead of keeping usage.
    await gate.spend('g:alice', '2026-08-02', 200, peeked.allowed && peeked.reserved);
    expect(await store.getGlobalTabCompleteTokenCount('2026-08-02')).toBe(200);
  });

  it('honours the stored tabCompletePaused switch without touching other lanes', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ tabCompletePaused: true }, 'operator');
    const gate = createTabCompleteGate({ store, ttlMs: 0 });
    expect(await gate.peek('g:alice', '2026-08-02')).toEqual({ allowed: false, reason: 'paused' });
    const editing = createEditingGate({ store, ttlMs: 0, defaultGlobalDailyCap: 5 });
    expect(await editing.checkAndSpend('g:alice', '2026-08-02')).toEqual({ allowed: true });
  });

  it('lets bots through uncounted, on both peek and spend', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyTabCompleteTokenCap: TAB_COMPLETE_TOKEN_RESERVATION }, 'operator');
    const gate = createTabCompleteGate({ store, ttlMs: 0 });
    expect(await gate.peek('bot:e2e', '2026-08-02')).toEqual({ allowed: true, reserved: false });
    await gate.spend('bot:e2e', '2026-08-02', 999_999, false);
    expect(await store.getGlobalTabCompleteTokenCount('2026-08-02')).toBe(0);
    // The real cap stays untouched, so a creator still gets a turn.
    expect(await gate.peek('g:alice', '2026-08-02')).toEqual({ allowed: true, reserved: true });
  });
});

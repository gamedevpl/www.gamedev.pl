import { describe, expect, it, vi } from 'vitest';
import {
  createCreationGate,
  DEFAULT_GLOBAL_DAILY_SUBMISSION_CAP,
  resolveDefaultGlobalDailyCap,
  type CreationGateOptions,
} from './creation-limits.js';
import type { CreationLimits, Store } from './store.js';

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

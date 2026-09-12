import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedAvailabilityGate } from './managed-availability.js';
import { InMemoryStore } from '../platform/store.js';

const today = '2026-08-09';

function gate(params: {
  store?: InMemoryStore;
  hasPlatformBackend?: boolean;
  ttlMs?: number;
  peekTtlMs?: number;
  now?: () => number;
  // The common case: one vendor built and selected as the default.
  defaultVendor?: string;
  configuredVendors?: ReadonlySet<string>;
}) {
  const store = params.store ?? new InMemoryStore();
  const hasPlatformBackend = params.hasPlatformBackend ?? true;
  return {
    store,
    gate: createManagedAvailabilityGate({
      store,
      hasPlatformBackend,
      ttlMs: params.ttlMs ?? 60_000,
      ...(params.peekTtlMs === undefined ? {} : { peekTtlMs: params.peekTtlMs }),
      now: params.now,
      ...(hasPlatformBackend
        ? {
            defaultVendor: params.defaultVendor ?? 'anthropic',
            configuredVendors: params.configuredVendors ?? new Set(['anthropic']),
          }
        : {}),
    }),
  };
}

const gate2 = () => gate({});

describe('peek reads a creator once per window', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers a second peek in the same request without reading again', async () => {
    const clock = 1_700_000_000_000;
    const { store, gate: g } = gate({ now: () => clock });
    const usage = vi.spyOn(store, 'getUsage');
    const global = vi.spyOn(store, 'getGlobalManagedBuildCount');

    await g.peek('g:creator', today);
    await g.peek('g:creator', today);

    expect(usage).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledTimes(1);
  });

  it('reads again once the window lapses', async () => {
    let clock = 1_700_000_000_000;
    const { store, gate: g } = gate({ now: () => clock, peekTtlMs: 10_000 });
    const usage = vi.spyOn(store, 'getUsage');

    await g.peek('g:creator', today);
    clock += 10_000;
    await g.peek('g:creator', today);
    expect(usage).toHaveBeenCalledTimes(2);
  });

  it('never answers one creator with another creator quota', async () => {
    const { store, gate: g } = gate({});
    const usage = vi.spyOn(store, 'getUsage');
    await g.peek('g:one', today);
    await g.peek('g:two', today);
    expect(usage).toHaveBeenCalledTimes(2);
  });

  it('keeps the window per day, so a rollover is not stale', async () => {
    const { store, gate: g } = gate({});
    const usage = vi.spyOn(store, 'getUsage');
    await g.peek('g:creator', today);
    await g.peek('g:creator', '2999-01-01');
    expect(usage).toHaveBeenCalledTimes(2);
  });

  it('does not let a peek that started before a spend seal in the old answer', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, gate: g } = gate2();
    vi.spyOn(store, 'getUsage').mockImplementation(async () => {
      await gate;
      return { managedBuilds: 0, improvements: 0, submissions: 0 } as never;
    });

    const slow = g.peek('g:creator', today);
    await g.checkAndSpend('g:creator', today);
    release();
    await slow;

    vi.restoreAllMocks();
    const usage = vi.spyOn(store, 'getUsage');
    await g.peek('g:creator', today);
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it('drops every window on a spend, because the global counter moved', async () => {
    const { store, gate: g } = gate({});
    await g.peek('g:one', today);
    await g.checkAndSpend('g:two', today);
    const usage = vi.spyOn(store, 'getUsage');
    await g.peek('g:one', today);
    expect(usage).toHaveBeenCalledTimes(1);
  });
});

describe('createManagedAvailabilityGate', () => {
  it('reads as coming_soon when this environment has no platform backend at all', async () => {
    const { gate: g } = gate({ hasPlatformBackend: false });
    expect(await g.peek('g:creator', today)).toEqual({ available: false, reason: 'coming_soon' });
    expect(await g.checkAndSpend('g:creator', today)).toEqual({ available: false, reason: 'coming_soon' });
  });

  it('is available when a backend is configured and nothing else says otherwise', async () => {
    const { gate: g } = gate({ hasPlatformBackend: true });
    expect(await g.peek('g:creator', today)).toEqual({ available: true });
    expect(await g.checkAndSpend('g:creator', today)).toEqual({ available: true });
  });

  it('honours an operator-set outage even when a backend is configured', async () => {
    const { store, gate: g } = gate({ hasPlatformBackend: true });
    await store.setCreationLimits({ managedBuilderMode: 'off' }, 'g:boss');
    expect(await g.peek('g:creator', today)).toEqual({ available: false, reason: 'outage' });
  });

  it('reports coming_soon when the operator marks it as not yet launched here', async () => {
    const { store, gate: g } = gate({ hasPlatformBackend: true });
    await store.setCreationLimits({ managedBuilderMode: 'coming_soon' }, 'g:boss');
    expect(await g.peek('g:creator', today)).toEqual({ available: false, reason: 'coming_soon' });
  });

  it('refuses once the shared daily cap is spent, and peek never spends it', async () => {
    const { store, gate: g } = gate({ hasPlatformBackend: true });
    await store.setCreationLimits({ managedDailyCap: 2 }, 'g:boss');

    // Peeking repeatedly must not itself exhaust the cap.
    expect(await g.peek('g:a', today)).toEqual({ available: true });
    expect(await g.peek('g:a', today)).toEqual({ available: true });
    expect(await store.getGlobalManagedBuildCount(today)).toBe(0);

    expect(await g.checkAndSpend('g:a', today)).toEqual({ available: true });
    expect(await g.checkAndSpend('g:b', today)).toEqual({ available: true });
    expect(await g.checkAndSpend('g:c', today)).toEqual({ available: false, reason: 'global_limit' });
  });

  it('refuses once a creator’s own daily cap is spent, independent of the shared one', async () => {
    const { store, gate: g } = gate({ hasPlatformBackend: true });
    await store.setCreationLimits({ managedDailyUserCap: 1 }, 'g:boss');
    await store.upsertUser({ uid: 'g:a' });
    await store.upsertUser({ uid: 'g:b' });

    expect(await g.checkAndSpend('g:a', today)).toEqual({ available: true });
    expect(await g.checkAndSpend('g:a', today)).toEqual({ available: false, reason: 'user_limit' });
    // A different creator's cap is untouched by g:a spending theirs.
    expect(await g.checkAndSpend('g:b', today)).toEqual({ available: true });
  });

  it('lets bot: accounts through every cap, the same as the creation breaker does', async () => {
    const { store, gate: g } = gate({ hasPlatformBackend: true });
    await store.setCreationLimits({ managedDailyCap: 0, managedDailyUserCap: 0 }, 'g:boss');
    expect(await g.checkAndSpend('bot:smoke', today)).toEqual({ available: true });
  });

  it('never enforces caps when none are set, even with no store at all', async () => {
    const g = createManagedAvailabilityGate({
      hasPlatformBackend: true,
      defaultVendor: 'anthropic',
      configuredVendors: new Set(['anthropic']),
    });
    expect(await g.checkAndSpend('g:creator', today)).toEqual({ available: true });
  });

  it('reads as coming_soon when a vendor built but none is selected (no default, no override)', async () => {
    // A built-but-unpicked vendor must not read as available.
    const g = createManagedAvailabilityGate({ hasPlatformBackend: true });
    expect(await g.peek('g:creator', today)).toEqual({ available: false, reason: 'coming_soon' });
  });

  it('resolveVendor prefers a valid stored override over the default', async () => {
    const { store, gate: g } = gate({
      defaultVendor: 'anthropic',
      configuredVendors: new Set(['anthropic', 'gemini']),
      ttlMs: 0, // two reads in one test — the cache must not shadow the second.
    });
    expect(await g.resolveVendor()).toBe('anthropic');
    await store.setCreationLimits({ managedAgentVendorOverride: 'gemini' }, 'g:boss');
    expect(await g.resolveVendor()).toBe('gemini');
  });

  it('resolveVendor falls back to the default when the override names an unconfigured vendor', async () => {
    const { store, gate: g } = gate({ defaultVendor: 'anthropic', configuredVendors: new Set(['anthropic']) });
    await store.setCreationLimits({ managedAgentVendorOverride: 'copilot' }, 'g:boss');
    expect(await g.resolveVendor()).toBe('anthropic');
  });
});

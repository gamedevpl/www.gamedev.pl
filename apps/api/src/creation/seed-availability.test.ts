import { describe, expect, it } from 'vitest';
import { createSeedAvailabilityGate } from './seed-availability.js';
import { InMemoryStore } from '../platform/store.js';

function gate(params: {
  store?: InMemoryStore;
  ttlMs?: number;
  now?: () => number;
  defaultProvider?: string;
  configuredProviders?: ReadonlySet<string>;
}) {
  const store = params.store ?? new InMemoryStore();
  return {
    store,
    gate: createSeedAvailabilityGate({
      store,
      ttlMs: params.ttlMs ?? 60_000,
      now: params.now,
      defaultProvider: params.defaultProvider ?? 'vertex',
      configuredProviders: params.configuredProviders ?? new Set(['vertex']),
    }),
  };
}

describe('createSeedAvailabilityGate', () => {
  it('is enabled and resolves to the default provider when nothing is stored', async () => {
    const { gate: g } = gate({});
    expect(await g.seedingEnabled()).toBe(true);
    expect(await g.resolveProvider()).toBe('vertex');
  });

  it('honours an operator-set off, the kill switch SEED_DISPATCH used to be', async () => {
    const { store, gate: g } = gate({});
    await store.setCreationLimits({ seedingMode: 'off' }, 'g:boss');
    expect(await g.seedingEnabled()).toBe(false);
  });

  it('an explicit auto is the same as unset', async () => {
    const { store, gate: g } = gate({});
    await store.setCreationLimits({ seedingMode: 'auto' }, 'g:boss');
    expect(await g.seedingEnabled()).toBe(true);
  });

  it('resolves a stored override once it is configured', async () => {
    const { store, gate: g } = gate({ configuredProviders: new Set(['vertex', 'anthropic']) });
    await store.setCreationLimits({ seedProviderOverride: 'anthropic' }, 'g:boss');
    expect(await g.resolveProvider()).toBe('anthropic');
  });

  it('falls back to the default when the stored override names an unconfigured vendor', async () => {
    const { store, gate: g } = gate({ configuredProviders: new Set(['vertex']) });
    await store.setCreationLimits({ seedProviderOverride: 'meta' }, 'g:boss');
    expect(await g.resolveProvider()).toBe('vertex');
  });

  it('clearing the override with null hands the decision back to the default', async () => {
    const { store, gate: g } = gate({ configuredProviders: new Set(['vertex', 'anthropic']) });
    await store.setCreationLimits({ seedProviderOverride: 'anthropic' }, 'g:boss');
    await store.setCreationLimits({ seedProviderOverride: null }, 'g:boss');
    expect(await g.resolveProvider()).toBe('vertex');
  });

  it('caches the document within the TTL rather than reading it on every call', async () => {
    let reads = 0;
    const store = new InMemoryStore();
    const original = store.getCreationLimits.bind(store);
    store.getCreationLimits = async () => {
      reads++;
      return original();
    };
    let clock = 0;
    const { gate: g } = gate({ store, now: () => clock, ttlMs: 1_000 });
    await g.seedingEnabled();
    await g.resolveProvider();
    expect(reads).toBe(1);
    clock = 2_000;
    await g.seedingEnabled();
    expect(reads).toBe(2);
  });
});

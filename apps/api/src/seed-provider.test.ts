import { describe, expect, it } from 'vitest';
import { registerSeedProvider, seedProviderIds, isSeedProviderRegistered, createSeedClient } from './seed-provider.js';

describe('seed provider registry', () => {
  it('registers a provider and lists it sorted', () => {
    registerSeedProvider('__test_z__', () => ({}) as never);
    registerSeedProvider('__test_a__', () => ({}) as never);
    const ids = seedProviderIds();
    expect(ids.indexOf('__test_a__')).toBeLessThan(ids.indexOf('__test_z__'));
  });

  it('reports registration before and after', () => {
    expect(isSeedProviderRegistered('__test_unregistered__')).toBe(false);
    registerSeedProvider('__test_unregistered__', () => ({}) as never);
    expect(isSeedProviderRegistered('__test_unregistered__')).toBe(true);
  });

  it('builds a client by delegating to the registered factory with the given config', () => {
    let received: unknown;
    registerSeedProvider('__test_factory__', (config) => {
      received = config;
      return { marker: 'built' } as never;
    });
    const client = createSeedClient('__test_factory__', { model: 'test-model', apiKey: 'k' });
    expect(client).toEqual({ marker: 'built' });
    expect(received).toEqual({ model: 'test-model', apiKey: 'k' });
  });

  it('throws naming the known providers when asked for an unregistered one', () => {
    registerSeedProvider('__test_known__', () => ({}) as never);
    expect(() => createSeedClient('__test_definitely_unregistered__', { model: 'x' })).toThrow(
      /__test_definitely_unregistered__/,
    );
  });

  // Catches a broken registration as a unit failure, not an integration one.
  it('always includes vertex once seed-provider-vertex.js has been imported', async () => {
    await import('./seed-provider-vertex.js');
    expect(isSeedProviderRegistered('vertex')).toBe(true);
  });
});

import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createManagedAvailabilityGate } from './managed-availability.js';
const today = '2026-09-09';
it('peeks at bot allowance without consuming it, including at exhaustion', async () => {
  const store = new InMemoryStore();
  const g = createManagedAvailabilityGate({
    store,
    hasPlatformBackend: true,
    defaultVendor: 'anthropic',
    configuredVendors: new Set(['anthropic']),
  });
  const spend = vi.spyOn(store, 'checkAndIncrementGlobalBotCalls');
  expect(await g.peek('bot:smoke', today)).toEqual({ available: true });
  expect(await g.peek('bot:smoke', today)).toEqual({ available: true });
  expect(spend).not.toHaveBeenCalled();
  expect(await store.getGlobalBotCallCount(today)).toBe(0);
  expect(await g.checkAndSpend('bot:smoke', today)).toEqual({ available: true });
  expect(await store.getGlobalBotCallCount(today)).toBe(1);
  vi.spyOn(store, 'getGlobalBotCallCount').mockResolvedValue(Number.MAX_SAFE_INTEGER);
  expect(await g.peek('bot:smoke', today)).toEqual({ available: false, reason: 'global_limit' });
  expect(spend).toHaveBeenCalledTimes(1);
});

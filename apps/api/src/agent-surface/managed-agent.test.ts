import { describe, expect, it } from 'vitest';
import {
  createManagedProvider,
  isManagedSessionHarvestable,
  isManagedSessionSettled,
  managedProviderVendors,
  ManagedAgentError,
  normalizeManagedState,
  registerManagedProvider,
  type ManagedAgentProvider,
} from './managed-agent.js';

describe('managed agent state normalization', () => {
  it('maps each vendor spelling onto one neutral vocabulary', () => {
    expect(normalizeManagedState('RUNNING')).toBe('in_progress');
    expect(normalizeManagedState('status_idle')).toBe('idle');
    expect(normalizeManagedState('succeeded')).toBe('completed');
    expect(normalizeManagedState('ended')).toBe('completed');
    expect(normalizeManagedState('expired')).toBe('timed_out');
    expect(normalizeManagedState('canceled')).toBe('cancelled');
    expect(normalizeManagedState('awaiting_input')).toBe('waiting_for_user');
    expect(normalizeManagedState(undefined)).toBe('queued');
  });

  it('treats an unknown state as work in progress, never as failure', () => {
    // A vendor adding a word must not abandon a live build.
    expect(normalizeManagedState('reticulating_splines')).toBe('in_progress');
  });

  it('separates settled from harvestable, because idle is neither', () => {
    expect(isManagedSessionSettled('idle')).toBe(false);
    expect(isManagedSessionHarvestable('idle')).toBe(true);
    expect(isManagedSessionHarvestable('in_progress')).toBe(false);
    for (const state of ['completed', 'failed', 'timed_out', 'cancelled'] as const) {
      expect(isManagedSessionSettled(state)).toBe(true);
      expect(isManagedSessionHarvestable(state)).toBe(true);
    }
  });
});

describe('provider registry', () => {
  it('builds a registered vendor and names the known ones when asked for a stranger', () => {
    const stub: ManagedAgentProvider = {
      vendor: 'test-vendor',
      model: 'test-model',
      startSession: async () => ({ id: 's1', state: 'queued' }),
      getSession: async () => null,
      cancelSession: async () => ({ enforced: true }),
    };
    registerManagedProvider('test-vendor', () => stub);

    expect(createManagedProvider('test-vendor', { apiKey: 'k', model: 'm' })).toBe(stub);
    expect(managedProviderVendors()).toContain('test-vendor');
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(ManagedAgentError);
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(/registered:/);
  });
});

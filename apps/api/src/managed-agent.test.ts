import { describe, expect, it } from 'vitest';
import {
  assertWithinManagedOutputCaps,
  createManagedProvider,
  isManagedSessionHarvestable,
  isManagedSessionSettled,
  managedProviderVendors,
  ManagedAgentError,
  ManagedOutputRejectedError,
  normalizeManagedState,
  registerManagedProvider,
  toGameRelativeOutputs,
  type ManagedAgentProvider,
} from './managed-agent.js';

describe('managed agent state normalization', () => {
  it('maps each vendor spelling onto one neutral vocabulary', () => {
    expect(normalizeManagedState('RUNNING')).toBe('in_progress');
    expect(normalizeManagedState('status_idle')).toBe('idle');
    expect(normalizeManagedState('succeeded')).toBe('completed');
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

describe('managed output caps', () => {
  it('accepts an ordinary game harvest', () => {
    const files = [
      { path: 'game.ts', content: 'export {};' },
      { path: 'SPEC.md', content: '# spec' },
    ];
    expect(assertWithinManagedOutputCaps(files)).toHaveLength(2);
  });

  it('refuses too many files, an oversized file, and an oversized total', () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ path: `game/${i}.ts`, content: 'x' }));
    expect(() => assertWithinManagedOutputCaps(many)).toThrow(ManagedOutputRejectedError);

    const huge = [{ path: 'game.ts', content: 'x'.repeat(1_000_001) }];
    expect(() => assertWithinManagedOutputCaps(huge)).toThrow(/output file too large/);

    const total = Array.from({ length: 3 }, (_, i) => ({ path: `game/${i}.ts`, content: 'x'.repeat(900_000) }));
    expect(() => assertWithinManagedOutputCaps(total)).toThrow(/output too large/);
  });
});

describe('harvest path mapping', () => {
  it('strips the game prefix and drops another game entirely', () => {
    const files = toGameRelativeOutputs(
      [
        { path: 'games/comet-courier/game.ts', content: 'a' },
        { path: './games/comet-courier/game/render.ts', content: 'b' },
        { path: 'games/other-game/game.ts', content: 'c' },
        { path: 'notes.md', content: 'd' },
      ],
      'comet-courier',
    );
    expect(files).toEqual([
      { path: 'game.ts', content: 'a' },
      { path: 'game/render.ts', content: 'b' },
      { path: 'notes.md', content: 'd' },
    ]);
  });

  it('rejects traversal, absolute, Windows, and NUL-containing paths before stripping prefixes', () => {
    for (const path of [
      'games/comet-courier/../other/game.ts',
      '/tmp/game.ts',
      'C:/workspace/game.ts',
      'games/comet-courier/game\\runtime.ts',
      'games/comet-courier/game\0.ts',
    ]) {
      expect(() => toGameRelativeOutputs([{ path, content: 'x' }], 'comet-courier')).toThrow(
        ManagedOutputRejectedError,
      );
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
      listOutputs: async () => [],
      cancelSession: async () => ({ enforced: true }),
    };
    registerManagedProvider('test-vendor', () => stub);

    expect(createManagedProvider('test-vendor', { apiKey: 'k', model: 'm' })).toBe(stub);
    expect(managedProviderVendors()).toContain('test-vendor');
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(ManagedAgentError);
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(/registered:/);
  });
});

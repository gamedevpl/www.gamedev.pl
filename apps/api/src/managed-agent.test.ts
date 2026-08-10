import { describe, expect, it } from 'vitest';
import {
  assertWithinManagedOutputCaps,
  assertWithinManagedOutputPlan,
  createManagedOutputBudget,
  createManagedProvider,
  isManagedSessionHarvestable,
  isManagedSessionSettled,
  managedProviderVendors,
  ManagedAgentError,
  ManagedOutputRejectedError,
  normalizeManagedState,
  selectManagedOutputs,
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

  it('refuses on the listing, so oversized bytes are never fetched', () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ ref: { path: `game/${i}.ts` }, path: `game/${i}.ts` }));
    expect(() => assertWithinManagedOutputPlan(many)).toThrow(/too many output files/);

    const huge = [{ ref: { path: 'game.ts', sizeBytes: 1_000_001 }, path: 'game.ts' }];
    expect(() => assertWithinManagedOutputPlan(huge)).toThrow(/output file too large/);

    const total = Array.from({ length: 3 }, (_, i) => ({
      ref: { path: `game/${i}.ts`, sizeBytes: 900_000 },
      path: `game/${i}.ts`,
    }));
    expect(() => assertWithinManagedOutputPlan(total)).toThrow(/output too large/);
  });

  it('lets an unsized listing through, because the bytes are still capped on arrival', () => {
    const plan = [{ ref: { path: 'game.ts' }, path: 'game.ts' }];
    expect(assertWithinManagedOutputPlan(plan)).toHaveLength(1);
    const budget = createManagedOutputBudget();
    expect(() => budget.admit('game.ts', 'x'.repeat(1_000_001))).toThrow(/output file too large/);
  });

  it('spends the total budget across files, so a drip of small files still stops', () => {
    const budget = createManagedOutputBudget();
    budget.admit('a.ts', 'x'.repeat(900_000));
    budget.admit('b.ts', 'x'.repeat(900_000));
    expect(() => budget.admit('c.ts', 'x'.repeat(900_000))).toThrow(/output too large/);
  });
});

describe('harvest path selection', () => {
  it('takes only the game directory, and says what it left behind', () => {
    const { plan, ignored } = selectManagedOutputs(
      [
        { path: 'games/comet-courier/game.ts' },
        { path: './games/comet-courier/game/render.ts' },
        { path: 'games/other-game/game.ts' },
        { path: 'scratch/notes.md' },
        { path: 'game.ts' },
      ],
      'comet-courier',
    );
    expect(plan.map((entry) => entry.path)).toEqual(['game.ts', 'game/render.ts']);
    // The vendor's own path survives; a read needs it.
    expect(plan[0].ref.path).toBe('games/comet-courier/game.ts');
    // Otherwise scratch notes land in the game's source tree.
    expect(ignored).toEqual(['games/other-game/game.ts', 'scratch/notes.md', 'game.ts']);
  });

  it('rejects traversal, absolute, Windows, and NUL-containing paths before stripping prefixes', () => {
    for (const path of [
      'games/comet-courier/../other/game.ts',
      '/tmp/game.ts',
      'C:/workspace/game.ts',
      'games/comet-courier/game\\runtime.ts',
      'games/comet-courier/game\0.ts',
    ]) {
      expect(() => selectManagedOutputs([{ path }], 'comet-courier')).toThrow(ManagedOutputRejectedError);
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
      readOutput: async () => '',
      cancelSession: async () => ({ enforced: true }),
    };
    registerManagedProvider('test-vendor', () => stub);

    expect(createManagedProvider('test-vendor', { apiKey: 'k', model: 'm' })).toBe(stub);
    expect(managedProviderVendors()).toContain('test-vendor');
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(ManagedAgentError);
    expect(() => createManagedProvider('nope', { apiKey: 'k', model: 'm' })).toThrow(/registered:/);
  });
});

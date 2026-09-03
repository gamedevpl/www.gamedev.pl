import { describe, expect, it } from 'vitest';
import { summarizeCliFunnel } from './visit-cli-funnel.js';
import { summarizeVisitFunnel } from './visit-funnel.js';
import type { VisitEvent } from '../platform/store.js';

describe('cli funnel', () => {
  it('reports every rung in order, zeroes included', () => {
    const started = (visitId: string): VisitEvent => ({
      visitId,
      type: 'visit_started',
      at: '2026-08-28T10:00:00.000Z',
      msSinceStart: 0,
      entry: 'cli',
    });
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'cli_step', at: '2026-08-28T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      step('a', 'installed'),
      step('a', 'authorized'),
      step('a', 'first_turn'),
      step('a', 'build_requested'),
      step('a', 'delivered'),
      started('b'),
      step('b', 'installed'),
      step('b', 'authorized'),
      step('b', 'authorized'),
      started('c'),
    ]);

    expect(funnel.cli).toEqual([
      { step: 'installed', visits: 2 },
      { step: 'authorized', visits: 2 },
      { step: 'first_turn', visits: 1 },
      { step: 'build_requested', visits: 1 },
      { step: 'delivered', visits: 1 },
      { step: 'published', visits: 0 },
      { step: 'delegate_offered', visits: 0 },
      { step: 'delegate_used', visits: 0 },
      { step: 'verify_failed', visits: 0 },
    ]);
  });

  it('counts a prefixed set the same way the aggregator does', () => {
    expect(summarizeCliFunnel([]).every((row) => row.visits === 0)).toBe(true);
  });
});

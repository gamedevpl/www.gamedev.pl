import { describe, expect, it } from 'vitest';
import { AUTONOMOUS_ACTOR, budgetVerdict, DEFAULT_AUTONOMY, mayActAutonomously, wantsSuggestions } from './autonomy.js';
import type { SuggestionRecord } from './platform/store.js';

/**
 * These are the rules that decide when a machine may change somebody's published game
 * without being asked. The tests are about the boundaries rather than the arithmetic:
 * what the default permits, what no setting permits, and what stops a router bug from
 * rebuilding the whole catalog overnight.
 */

const NOW = Date.parse('2026-08-01T12:00:00.000Z');

function decided(partial: Partial<SuggestionRecord> = {}): SuggestionRecord {
  return {
    id: 'sug',
    slug: 'crashy',
    ownerUid: 'g:owner',
    class: 'defect',
    priority: 1,
    evidence: [],
    status: 'dispatched',
    computedFrom: '2026-08-01T03:00:00.000Z',
    createdAt: '2026-08-01T03:00:00.000Z',
    updatedAt: '2026-08-01T03:00:00.000Z',
    decidedBy: AUTONOMOUS_ACTOR,
    decidedAt: '2026-08-01T03:00:00.000Z',
    ...partial,
  };
}

describe('what each mode permits', () => {
  it('defaults to acting on nothing', () => {
    // A creator who has never opened this setting has not agreed to anything, and the
    // default has to encode that rather than a guess about what they would want.
    expect(DEFAULT_AUTONOMY).toBe('suggest');
    expect(mayActAutonomously('suggest', 'defect')).toBe(false);
    expect(mayActAutonomously('suggest', 'friction')).toBe(false);
  });

  it('lets auto-fix-defects act on crashes and nothing else', () => {
    expect(mayActAutonomously('auto-fix-defects', 'defect')).toBe(true);
    expect(mayActAutonomously('auto-fix-defects', 'friction')).toBe(false);
  });

  it('lets auto-tune act on tuning inside the spec', () => {
    expect(mayActAutonomously('auto-tune', 'defect')).toBe(true);
    expect(mayActAutonomously('auto-tune', 'friction')).toBe(true);
  });

  it('never lets any mode rewrite the spec', () => {
    // The load-bearing one. A design change means the creator's own statement of what
    // they wanted has to change; a machine doing that unasked has stopped improving
    // their game and started replacing it. There is deliberately no setting for it.
    for (const mode of ['suggest', 'auto-fix-defects', 'auto-tune'] as const) {
      expect(mayActAutonomously(mode, 'design-change')).toBe(false);
      expect(mayActAutonomously(mode, 'editorial')).toBe(false);
    }
  });

  it('treats digest-only as "do not even raise it"', () => {
    expect(wantsSuggestions('digest-only')).toBe(false);
    expect(wantsSuggestions('suggest')).toBe(true);
  });
});

describe('the budget', () => {
  it('allows the first start of the day', () => {
    expect(budgetVerdict({ decided: [], slug: 'crashy', now: NOW })).toEqual({ allowed: true });
  });

  it('stops at two autonomous starts a day, across every game', () => {
    // Bounds cost. A router bug that suddenly finds forty defects should spend two agent
    // runs, not forty.
    const spent = [decided({ id: 'a', slug: 'one' }), decided({ id: 'b', slug: 'two' })];

    const verdict = budgetVerdict({ decided: spent, slug: 'three', now: NOW });

    expect(verdict.allowed).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('global daily') });
  });

  it('stops at one start per game per week even when the global budget has room', () => {
    // Bounds nuisance rather than cost: a game whose evidence keeps routing to defect
    // would otherwise be rebuilt nightly while its creator watches.
    const lastWeek = decided({ id: 'a', decidedAt: '2026-07-29T03:00:00.000Z' });

    const verdict = budgetVerdict({ decided: [lastWeek], slug: 'crashy', now: NOW });

    expect(verdict.allowed).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('this week') });
  });

  it('lets a different game through while one is rate-limited', () => {
    const lastWeek = decided({ id: 'a', decidedAt: '2026-07-29T03:00:00.000Z' });

    expect(budgetVerdict({ decided: [lastWeek], slug: 'another', now: NOW })).toEqual({ allowed: true });
  });

  it('does not count a creator’s own approvals against the platform’s budget', () => {
    // A creator spending their own improvement allowance is not the thing this bounds,
    // and counting it would let one enthusiastic creator mute autonomy for everyone.
    const byHuman = [
      decided({ id: 'a', slug: 'one', decidedBy: 'g:owner' }),
      decided({ id: 'b', slug: 'two', decidedBy: 'g:owner' }),
      decided({ id: 'c', slug: 'three', decidedBy: 'g:owner' }),
    ];

    expect(budgetVerdict({ decided: byHuman, slug: 'four', now: NOW })).toEqual({ allowed: true });
  });

  it('forgets yesterday’s spend', () => {
    const yesterday = [
      decided({ id: 'a', slug: 'one', decidedAt: '2026-07-30T03:00:00.000Z' }),
      decided({ id: 'b', slug: 'two', decidedAt: '2026-07-30T04:00:00.000Z' }),
    ];

    expect(budgetVerdict({ decided: yesterday, slug: 'three', now: NOW })).toEqual({ allowed: true });
  });
});

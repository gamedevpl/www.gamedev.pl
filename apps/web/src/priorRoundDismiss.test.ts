// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { isPriorRoundDismissed, setPriorRoundDismissed } from './priorRoundDismiss.js';

describe('priorRoundDismiss', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to visible and remembers a dismiss per slug + round', () => {
    expect(isPriorRoundDismissed('tv-tycoon', '101')).toBe(false);
    setPriorRoundDismissed('tv-tycoon', '101', true);
    expect(isPriorRoundDismissed('tv-tycoon', '101')).toBe(true);
    expect(isPriorRoundDismissed('tv-tycoon', '102')).toBe(false);
    expect(isPriorRoundDismissed('other-game', '101')).toBe(false);
    setPriorRoundDismissed('tv-tycoon', '101', false);
    expect(isPriorRoundDismissed('tv-tycoon', '101')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { applyPoke, chainFrom } from './create-step-play.js';

describe('create-step-play', () => {
  it('chains a poke down the remaining spine', () => {
    expect(chainFrom(0)).toEqual([0, 1, 2, 3]);
    expect(chainFrom(2)).toEqual([2, 3]);
    expect(chainFrom(3)).toEqual([3]);
  });

  it('advances a 1-2-3-4 combo and resets on a miss', () => {
    expect(applyPoke(0, 0)).toEqual({ comboNext: 1, won: false, miss: false });
    expect(applyPoke(1, 1)).toEqual({ comboNext: 2, won: false, miss: false });
    expect(applyPoke(2, 2)).toEqual({ comboNext: 3, won: false, miss: false });
    expect(applyPoke(3, 3)).toEqual({ comboNext: 0, won: true, miss: false });
    expect(applyPoke(0, 2)).toEqual({ comboNext: 0, won: false, miss: true });
    expect(applyPoke(1, 0)).toEqual({ comboNext: 0, won: false, miss: true });
  });
});

import { describe, expect, it } from 'vitest';
import { TREND_GRAINS } from './trend-grain.js';

describe('TREND_GRAINS', () => {
  it('lists the trend rollup granularities', () => {
    expect(TREND_GRAINS).toEqual(['day', 'week', 'month']);
  });
});

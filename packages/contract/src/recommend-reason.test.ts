import { describe, expect, it } from 'vitest';
import { RECOMMEND_REASONS } from './recommend-reason.js';

describe('RECOMMEND_REASONS', () => {
  it('lists the four recommendation reasons', () => {
    expect(RECOMMEND_REASONS).toEqual(['popular', 'for_you', 'because_you_played', 'continue']);
  });
});

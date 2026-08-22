import { describe, expect, it } from 'vitest';
import { BUILDER_UNAVAILABLE_REASONS } from './builder-availability.js';

describe('BUILDER_UNAVAILABLE_REASONS', () => {
  it('lists why platform can be unavailable', () => {
    expect(BUILDER_UNAVAILABLE_REASONS).toEqual(['coming_soon', 'outage', 'global_limit', 'user_limit']);
  });
});

import { describe, expect, it } from 'vitest';
import { DECLINE_REASONS } from './decline-reason.js';

describe('DECLINE_REASONS', () => {
  it('lists the six reasons the API and web both derive', () => {
    expect(DECLINE_REASONS).toEqual(['not_the_direction', 'duplicate', 'quality', 'off_topic', 'unsafe', 'infringing']);
  });
});

import { describe, expect, it } from 'vitest';
import { ZONE_PROTOCOL_VERSION } from './zone-protocol.js';

describe('ZONE_PROTOCOL_VERSION', () => {
  it('is the single version both zone ends check', () => {
    expect(ZONE_PROTOCOL_VERSION).toBe(1);
  });
});

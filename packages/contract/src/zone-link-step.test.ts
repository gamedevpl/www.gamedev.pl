import { describe, expect, it } from 'vitest';
import { ZONE_LINK_STEPS } from './zone-link-step.js';

describe('ZONE_LINK_STEPS', () => {
  it('lists the zone-link funnel steps in order', () => {
    expect(ZONE_LINK_STEPS).toEqual(['admitted', 'joined', 'lost']);
  });
});

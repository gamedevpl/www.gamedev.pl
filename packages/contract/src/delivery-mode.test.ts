import { describe, expect, it } from 'vitest';
import { DELIVERY_MODES } from './delivery-mode.js';

describe('DELIVERY_MODES', () => {
  it('lists the three delivery lanes', () => {
    expect(DELIVERY_MODES).toEqual(['preview', 'publish', 'proposal']);
  });
});

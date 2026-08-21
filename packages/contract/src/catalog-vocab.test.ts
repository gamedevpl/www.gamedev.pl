import { describe, expect, it } from 'vitest';
import { CATALOG_ORIENTATIONS, CATALOG_TOUCH_VALUES } from './catalog-vocab.js';

describe('CATALOG_ORIENTATIONS', () => {
  it('lists the orientations a game can declare', () => {
    expect(CATALOG_ORIENTATIONS).toEqual(['any', 'portrait', 'landscape', 'adaptive']);
  });
});

describe('CATALOG_TOUCH_VALUES', () => {
  it('lists the touch-playability classes', () => {
    expect(CATALOG_TOUCH_VALUES).toEqual(['gamekit', 'native', 'controllers', 'none']);
  });
});

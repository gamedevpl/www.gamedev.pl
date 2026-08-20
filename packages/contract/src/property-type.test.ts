import { describe, expect, it } from 'vitest';
import { PROPERTY_TYPES } from './property-type.js';

describe('PROPERTY_TYPES', () => {
  it('lists the five types the API and web both derive', () => {
    expect(PROPERTY_TYPES).toEqual(['text', 'int', 'number', 'enum', 'bool']);
  });
});

import { describe, expect, it } from 'vitest';
import { LOCALES } from './locale.js';

describe('LOCALES', () => {
  it('lists the supported UI/game locales', () => {
    expect(LOCALES).toEqual(['en', 'pl']);
  });
});

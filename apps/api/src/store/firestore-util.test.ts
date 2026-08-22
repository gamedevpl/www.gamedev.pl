import { describe, expect, it } from 'vitest';
import { stripUndefined } from './firestore-util.js';

describe('stripUndefined', () => {
  it('drops undefined keys and keeps every other falsy value', () => {
    expect(stripUndefined({ a: undefined, b: null, c: 0, d: '', e: false, f: 'x' })).toEqual({
      b: null,
      c: 0,
      d: '',
      e: false,
      f: 'x',
    });
  });
});

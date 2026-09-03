import { describe, expect, it } from 'vitest';
import { glyphs, wantsColor } from './renderer.js';

describe('glyphs', () => {
  it('downgrades glyphs when color is off', () => {
    expect(glyphs(false).agent).toBe('*');
    expect(glyphs(true).agent).toBe('◆');
    expect(wantsColor({ NO_COLOR: '1' }, true)).toBe(false);
    expect(wantsColor({}, true)).toBe(true);
    expect(wantsColor({}, false)).toBe(false);
  });
});

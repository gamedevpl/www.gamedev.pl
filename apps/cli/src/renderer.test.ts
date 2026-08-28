import { describe, expect, it } from 'vitest';
import { createTwoRegion, glyphs, renderLive, wantsColor } from './renderer.js';

describe('two-region renderer', () => {
  it('never rewrites transcript lines', () => {
    const region = createTwoRegion();
    region.print('› hello');
    region.setLive(['▸ building']);
    region.promote('✓ preview ready');
    expect(region.transcript).toEqual(['› hello', '✓ preview ready']);
    expect(region.live).toEqual([]);
  });

  it('truncates live lines to the terminal width', () => {
    expect(renderLive(['abcdefghij'], 6)).toBe('abcde…');
  });

  it('downgrades glyphs when color is off', () => {
    expect(glyphs(false).agent).toBe('*');
    expect(glyphs(true).agent).toBe('◆');
    expect(wantsColor({ NO_COLOR: '1' }, true)).toBe(false);
    expect(wantsColor({}, true)).toBe(true);
    expect(wantsColor({}, false)).toBe(false);
  });
});

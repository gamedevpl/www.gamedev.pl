import { describe, expect, it } from 'vitest';
import { colorForPicker, colorFromPicker, expandHexColor, findHexColors, replaceHexColor } from './codeMirrorColors.js';

describe('codeMirrorColors', () => {
  it('finds supported color formats without matching longer hex values', () => {
    const source = "fill: '#abc'; stroke: #12Ab34; shadow: #12345678; id: #abcdef0;";

    expect(findHexColors(source)).toEqual([
      { color: '#abc', from: 7, to: 11 },
      { color: '#12Ab34', from: 22, to: 29 },
      { color: '#12345678', from: 39, to: 48 },
    ]);
  });

  it('expands shorthand colors for the native picker', () => {
    expect(expandHexColor('#AbC')).toBe('#aabbcc');
    expect(expandHexColor('#AbCf')).toBe('#aabbccff');
    expect(expandHexColor('#12Ab34')).toBe('#12ab34');
  });

  it('preserves alpha while the native picker edits RGB', () => {
    expect(colorForPicker('#12345678')).toBe('#123456');
    expect(colorFromPicker('#12345678', '#abcdef')).toBe('#abcdef78');
    expect(colorFromPicker('#abc', '#abcdef')).toBe('#abcdef');
  });

  it('replaces only the selected literal', () => {
    const source = "fill: '#abc'; stroke: '#abc';";
    const match = findHexColors(source)[1]!;

    expect(replaceHexColor(source, match.from, match.to, '#112233')).toBe("fill: '#abc'; stroke: '#112233';");
  });
});

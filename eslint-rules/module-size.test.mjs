import { describe, expect, it } from 'vitest';
import { baselineLinesFor, countLines, MODULE_SIZE_HARD_CAP_LINES } from './module-size-lib.mjs';

describe('countLines', () => {
  it('counts an empty file as zero lines', () => {
    expect(countLines('')).toBe(0);
  });

  it('does not invent an extra line for a trailing newline', () => {
    expect(countLines('a\nb\n')).toBe(2);
  });

  it('counts a file with no trailing newline', () => {
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('baselineLinesFor', () => {
  it('missing file gets the hard cap, not zero', () => {
    expect(
      baselineLinesFor({ version: 1, hardCapLines: MODULE_SIZE_HARD_CAP_LINES, files: { 'a.ts': 900 } }, 'new.ts'),
    ).toBe(MODULE_SIZE_HARD_CAP_LINES);
  });

  it('baselined file keeps its own ceiling, even above the hard cap', () => {
    const baseline = { version: 1, hardCapLines: MODULE_SIZE_HARD_CAP_LINES, files: { 'a.ts': 8748 } };
    expect(baselineLinesFor(baseline, 'a.ts')).toBe(8748);
  });
});

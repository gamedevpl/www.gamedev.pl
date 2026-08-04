import { createPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { applySourcePatch, normalizePatchPath, SourcePatchError } from './source-patch.js';

describe('normalizePatchPath', () => {
  it('strips a/b prefixes, tabs, and quotes', () => {
    expect(normalizePatchPath('a/game/render.ts')).toBe('game/render.ts');
    expect(normalizePatchPath('b/game/render.ts')).toBe('game/render.ts');
    expect(normalizePatchPath('game/render.ts\t2026-01-01 00:00:00')).toBe('game/render.ts');
    expect(normalizePatchPath('"game/render.ts"')).toBe('game/render.ts');
  });
});

describe('applySourcePatch', () => {
  const content = 'line1\nline2\nline3\n';

  it('applies a unified diff hunk', () => {
    const patch = createPatch('game/render.ts', content, 'line1\nline2x\nline3\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
    expect(result.replacements).toBe(1);
  });

  it('accepts git-style a/ b/ headers', () => {
    const patch = [
      '--- a/game/render.ts',
      '+++ b/game/render.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2x',
      ' line3',
      '',
    ].join('\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
  });

  it('refuses an empty patch', () => {
    expect(() => applySourcePatch({ content, path: 'game.ts', patch: '   ' })).toThrow(SourcePatchError);
  });

  it('refuses a path mismatch', () => {
    const patch = createPatch('other.ts', content, 'line1\nx\nline3\n');
    expect(() => applySourcePatch({ content, path: 'game.ts', patch })).toThrow(/does not match/);
  });

  it('refuses a multi-file patch', () => {
    const one = createPatch('a.ts', 'a\n', 'b\n');
    const two = createPatch('b.ts', 'c\n', 'd\n');
    expect(() => applySourcePatch({ content: 'a\n', path: 'a.ts', patch: `${one}\n${two}` })).toThrow(/touches/);
  });

  it('refuses a stale context (no fuzzy apply)', () => {
    const patch = createPatch('game.ts', content, 'line1\nline2x\nline3\n');
    expect(() => applySourcePatch({ content: 'different\n', path: 'game.ts', patch })).toThrow(/did not apply/);
  });
});

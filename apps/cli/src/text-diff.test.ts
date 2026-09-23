import { describe, expect, it } from 'vitest';
import { unifiedDiff } from './text-diff.js';
import { formatPatches } from './working-copy.js';

describe('unifiedDiff', () => {
  it('prints a hunk for a changed line and nothing when the text matches', () => {
    expect(unifiedDiff('game.ts', 'same\n', 'same\n')).toEqual([]);
    expect(unifiedDiff('game.ts', 'a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      '--- platform/game.ts',
      '+++ local/game.ts',
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+B',
      ' c',
    ]);
  });

  it('shows an added file against /dev/null', () => {
    expect(unifiedDiff('new.ts', null, 'hi\n')).toEqual([
      '--- /dev/null',
      '+++ local/new.ts',
      '@@ -1,0 +1,1 @@',
      '+hi',
    ]);
  });

  it('shows an empty file that was added or removed', () => {
    expect(unifiedDiff('empty.ts', null, '')).toEqual(['--- /dev/null', '+++ local/empty.ts']);
    expect(unifiedDiff('empty.ts', '', null)).toEqual(['--- platform/empty.ts', '+++ /dev/null']);
    expect(unifiedDiff('empty.ts', '', '')).toEqual([]);
    const sync = { kind: 'local_only' as const, version: 'v1', local: ['empty.ts'], platform: [], conflict: [] };
    expect(formatPatches(sync, [{ path: 'empty.ts', content: '' }], []).join('\n')).toContain('+++ local/empty.ts');
  });

  it('does not dump a binary or a huge file', () => {
    expect(unifiedDiff('blob.bin', 'a', 'a\0b')).toContain('binary blob.bin differs');
    const big = `${'x\n'.repeat(1501)}`;
    expect(unifiedDiff('big.ts', big, `${big}y\n`).at(-1)).toMatch(/big.ts differs/);
  });
});

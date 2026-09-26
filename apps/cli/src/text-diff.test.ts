import { describe, expect, it } from 'vitest';
import { unifiedDiff } from './text-diff.js';
import { formatDiffReport, formatPatches } from './working-copy.js';

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

  it('preserves a blank line when an added file has a single newline', () => {
    expect(unifiedDiff('newline.ts', null, '\n')).toEqual([
      '--- /dev/null',
      '+++ local/newline.ts',
      '@@ -1,0 +1,1 @@',
      '+',
    ]);
  });

  it('strips terminal controls from patch lines', () => {
    const esc = '\u001b';
    const controls = `${esc}[2J${esc}]0;title\u0007\r\u009b31m\u009dtitle\u009c`;
    const patch = unifiedDiff('game.ts', 'ok\n', `ok${controls}\n`).join('\n');
    expect(patch).toContain('+ok');
    expect(patch).not.toContain(esc);
    expect(patch).not.toContain('\u0007');
    expect(patch).not.toContain('\r');
    expect(patch).not.toMatch(/[\u0080-\u009f]/u);
  });

  it('does not dump a binary or a huge file', () => {
    expect(unifiedDiff('blob.bin', 'a', 'a\0b')).toContain('binary blob.bin differs');
    const big = `${'x\n'.repeat(1501)}`;
    expect(unifiedDiff('big.ts', big, `${big}y\n`).at(-1)).toMatch(/big.ts differs/);
  });

  it('strips C1 controls and carriage returns from every path in a diff report', () => {
    const hostile = `evil\u009b2J\u009d0;title\u009c\r\u001b[31m.ts`;
    const hit = (source: 'gitignore' | 'not-game') => ({ path: hostile, source, pattern: '*', directory: false });
    const sync = {
      kind: 'conflict' as const,
      version: 'v1',
      local: [hostile],
      platform: [hostile],
      conflict: [hostile],
    };
    const patches = formatPatches(sync, [{ path: hostile, content: 'b\n' }], [{ path: hostile, content: 'a\n' }]);
    const report = formatDiffReport({
      ...sync,
      ignored: [hit('gitignore'), hit('not-game')],
      patches,
      incoming: { blocked: [hostile] },
    });
    const text = report.join('\n');
    expect(text).toContain('evil2J0;title.ts');
    const hidden = [...text].filter((ch) => {
      const code = ch.charCodeAt(0);
      return (code < 32 && code !== 10) || (code >= 127 && code <= 159);
    });
    expect(hidden).toEqual([]);
  });
});

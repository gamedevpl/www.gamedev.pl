import { describe, expect, it } from 'vitest';
import { diffLines, DIFF_LINE_CAP, summarizeSourceDiff } from './source-diff.js';

describe('diffLines', () => {
  it('counts added and removed lines through an LCS, not a length delta', () => {
    // One line replaced in the middle: 1 in, 1 out — not "same length, no change".
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual({ added: 1, removed: 1 });
    expect(diffLines('a\nb', 'a\nb\nc')).toEqual({ added: 1, removed: 0 });
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual({ added: 0, removed: 1 });
    expect(diffLines('same', 'same')).toEqual({ added: 0, removed: 0 });
    // A reordering is a move: LCS keeps the longest run and charges the rest.
    expect(diffLines('a\nb\nc', 'c\nb\na')).toEqual({ added: 2, removed: 2 });
  });

  it('treats an empty side as a whole-file add or remove', () => {
    expect(diffLines('', 'a\nb')).toEqual({ added: 2, removed: 0 });
    expect(diffLines('a\nb', '')).toEqual({ added: 0, removed: 2 });
    expect(diffLines('', '')).toEqual({ added: 0, removed: 0 });
  });

  it('normalises CRLF so a line-ending change is not a whole-file rewrite', () => {
    expect(diffLines('a\r\nb', 'a\nb')).toEqual({ added: 0, removed: 0 });
  });

  it('refuses to count a file past the cap rather than building a huge table', () => {
    const huge = Array.from({ length: DIFF_LINE_CAP + 1 }, (_, i) => `line ${i}`).join('\n');
    expect(diffLines(huge, 'a')).toBeNull();
    expect(diffLines('a', huge)).toBeNull();
  });
});

describe('summarizeSourceDiff', () => {
  it('classifies adds, removes and edits, and drops identical files', () => {
    const before = new Map([
      ['game.ts', 'a\nb\nc'],
      ['style.css', 'body {}'],
      ['gone.ts', 'x\ny'],
    ]);
    const after = new Map([
      ['game.ts', 'a\nB\nc'],
      ['style.css', 'body {}'],
      ['new.ts', 'fresh'],
    ]);

    const summary = summarizeSourceDiff(before, after);

    // style.css is untouched and must not appear at all.
    expect(summary.files.map((file) => file.path)).toEqual(['game.ts', 'gone.ts', 'new.ts']);
    expect(summary.files).toEqual([
      { path: 'game.ts', status: 'modified', added: 1, removed: 1 },
      { path: 'gone.ts', status: 'removed', added: 0, removed: 2 },
      { path: 'new.ts', status: 'added', added: 1, removed: 0 },
    ]);
    expect(summary).toMatchObject({ filesChanged: 3, added: 2, removed: 3, truncated: false });
  });

  it('reports totals as a floor when a file was too large to count', () => {
    const huge = Array.from({ length: DIFF_LINE_CAP + 1 }, (_, i) => `line ${i}`).join('\n');
    const summary = summarizeSourceDiff(new Map([['big.ts', huge]]), new Map([['big.ts', `${huge}\nmore`]]));

    expect(summary.truncated).toBe(true);
    expect(summary.files[0]).toEqual({ path: 'big.ts', status: 'modified', added: null, removed: null });
  });

  it('is empty for identical trees', () => {
    const tree = new Map([['game.ts', 'a']]);
    expect(summarizeSourceDiff(tree, new Map(tree))).toEqual({
      files: [],
      filesChanged: 0,
      added: 0,
      removed: 0,
      truncated: false,
    });
  });
});

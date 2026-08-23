import { describe, expect, it } from 'vitest';
import { diffFile, diffProposal, MAX_DIFF_FILES, MAX_DIFF_LINES_PER_FILE } from './proposal-diff.js';

describe('diffFile', () => {
  it('reports nothing when the file did not change', () => {
    expect(diffFile('game.ts', 'a\nb\n', 'a\nb\n')).toBeNull();
  });

  it('marks an added file', () => {
    const diff = diffFile('game/new.ts', null, 'export const x = 1;\n');
    expect(diff).toMatchObject({ status: 'added', additions: 1, deletions: 0 });
  });

  it('marks a removed file', () => {
    const diff = diffFile('game/old.ts', 'export const x = 1;\n', null);
    expect(diff).toMatchObject({ status: 'removed', additions: 0, deletions: 1 });
  });

  it('finds the changed line and keeps context around it', () => {
    const before = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const after = ['a', 'b', 'CHANGED', 'd', 'e'].join('\n');
    const diff = diffFile('game.ts', before, after);
    expect(diff).toMatchObject({ status: 'modified', additions: 1, deletions: 1 });
    expect(diff!.lines.some((line) => line.kind === 'add' && line.text === 'CHANGED')).toBe(true);
    expect(diff!.lines.some((line) => line.kind === 'del' && line.text === 'c')).toBe(true);
  });

  it('drops context far from any change', () => {
    // A one-line change in a long file must not render the whole file: the reviewer
    // would scroll past the thing they were asked to look at.
    const before = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n');
    const after = before.replace('line 100', 'line 100 changed');
    const diff = diffFile('game.ts', before, after);
    expect(diff!.lines.length).toBeLessThan(20);
  });

  it('does not treat a trailing newline as a change', () => {
    // A phantom empty last line would report every file as modified the moment one side
    // was written with a trailing newline and the other was not.
    expect(diffFile('game.ts', 'a\nb\n', 'a\nb')).toBeNull();
  });

  it('caps a very large diff and says it did', () => {
    const before = Array.from({ length: 2000 }, (_, index) => `x ${index}`).join('\n');
    const after = Array.from({ length: 2000 }, (_, index) => `y ${index}`).join('\n');
    const diff = diffFile('game.ts', before, after);
    expect(diff!.lines.length).toBe(MAX_DIFF_LINES_PER_FILE);
    expect(diff!.truncated).toBe(true);
    // Counts describe the real change, not the truncated view — a reviewer deciding
    // whether to read further needs the real size.
    expect(diff!.additions).toBe(2000);
  });
});

describe('diffProposal', () => {
  const base = [
    { path: 'SPEC.md', content: 'title: Neon Drift\n' },
    { path: 'game.ts', content: 'export const grip = 0.5;\n' },
  ];

  it('reports only the files that changed', () => {
    const proposed = [
      { path: 'SPEC.md', content: 'title: Neon Drift\n' },
      { path: 'game.ts', content: 'export const grip = 0.82;\n' },
    ];
    const diff = diffProposal(base, proposed);
    expect(diff.files.map((file) => file.path)).toEqual(['game.ts']);
    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
  });

  it('sees a file the proposal adds and one it removes', () => {
    const proposed = [
      { path: 'SPEC.md', content: 'title: Neon Drift\n' },
      { path: 'game/ghost.ts', content: 'export const ghost = true;\n' },
    ];
    const diff = diffProposal(base, proposed);
    expect(diff.files.map((file) => `${file.status}:${file.path}`).sort()).toEqual([
      'added:game/ghost.ts',
      'removed:game.ts',
    ]);
  });

  it('reports how many files it omitted rather than hiding them', () => {
    // A review showing 40 of 60 changed files would read as complete, and a reviewer
    // would approve what they never saw.
    const many = Array.from({ length: MAX_DIFF_FILES + 5 }, (_, index) => ({
      path: `game/mod${index}.ts`,
      content: `export const a${index} = 1;\n`,
    }));
    const diff = diffProposal([], many);
    expect(diff.files.length).toBe(MAX_DIFF_FILES);
    expect(diff.omittedFiles).toBe(5);
  });

  it('is empty for a proposal that changed nothing', () => {
    expect(diffProposal(base, base)).toMatchObject({ files: [], additions: 0, deletions: 0, omittedFiles: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { draftsFromServer, forEachTsPath, mergeMutationDrafts } from './codeSurfaceTreeApply.js';

describe('codeSurfaceTreeApply', () => {
  it('replaces drafts for paths the server still has after a failed batch', () => {
    const next = draftsFromServer(
      { 'game.ts': 'old draft', 'gone.ts': 'stale' },
      [{ path: 'game.ts', content: 'from server' }],
      ['game.ts', 'gone.ts'],
    );
    expect(next).toEqual({ 'game.ts': 'from server' });
  });

  it('applies local writes over deletes', () => {
    const next = mergeMutationDrafts({ 'old.ts': 'x' }, [{ path: 'new.ts', content: 'y' }], ['old.ts']);
    expect(next).toEqual({ 'new.ts': 'y' });
  });

  it('visits only TypeScript paths and passes null for removals', () => {
    const seen: Array<[string, string | null]> = [];
    forEachTsPath(
      ['game.ts', 'SPEC.md', 'gone.ts'],
      (path) => (path === 'gone.ts' ? null : 'ok'),
      (path, content) => {
        seen.push([path, content]);
      },
    );
    expect(seen).toEqual([
      ['game.ts', 'ok'],
      ['gone.ts', null],
    ]);
  });
});

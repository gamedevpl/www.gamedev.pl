import { expect, it, vi } from 'vitest';
import { syncCodeLanguageFiles } from '../browser/code-project-sync.js';
import { loadCodeDrafts, persistCodeDrafts, hasCodeDrafts, reconcileCodeDrafts } from '../browser/code-drafts.js';

it('updates only changed VFS files, deleting disk removals without reparsing unchanged kit', () => {
  const service = { updateFile: vi.fn(), deleteFile: vi.fn(), worker: {} as never, destroy: vi.fn() };
  const before = new Map([
    ['game.ts', 'v1'],
    ['removed.ts', 'old'],
    ['shared/game-kit.d.ts', 'kit'],
  ]);
  syncCodeLanguageFiles(service, before, { 'game.ts': 'v2', 'shared/game-kit.d.ts': 'kit' });
  expect(service.updateFile).toHaveBeenCalledExactlyOnceWith('game.ts', 'v2');
  expect(service.deleteFile).toHaveBeenCalledExactlyOnceWith('removed.ts');
  syncCodeLanguageFiles(service, before, { 'game.ts': 'v2', 'shared/game-kit.d.ts': 'kit' });
  expect(service.updateFile).toHaveBeenCalledTimes(1);
});
it('removes clean deleted files but keeps dirty deleted drafts and their bases', () => {
  const file = { path: 'game.ts', content: 'base', version: 'v1', revision: 'r1', readOnly: false };
  const workspace = {
    selected: 'clean.ts',
    drafts: new Map([
      ['clean.ts', { base: { ...file, path: 'clean.ts' }, content: 'base' }],
      ['dirty.ts', { base: { ...file, path: 'dirty.ts' }, content: 'draft' }],
    ]),
  };
  reconcileCodeDrafts(workspace, [file]);
  expect(workspace.drafts.has('clean.ts')).toBe(false);
  expect(workspace.drafts.get('dirty.ts')?.content).toBe('draft');
  expect(workspace.selected).toBe('game.ts');
});
it('backs up dirty content, base versions and editor history, without storing clean source copies', () => {
  let value: string | null = null;
  vi.stubGlobal('sessionStorage', {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  });
  const base = { path: 'game.ts', content: 'base', version: 'v1', revision: 'r1', readOnly: false };
  const workspaces = new Map([
    [
      'project',
      {
        selected: 'game.ts',
        drafts: new Map([
          ['game.ts', { base, content: 'draft', editor: { doc: 'draft', selection: {}, history: { done: [1] } } }],
          ['clean.ts', { base, content: 'base' }],
        ]),
      },
    ],
  ]);
  expect(hasCodeDrafts(workspaces)).toBe(true);
  expect(persistCodeDrafts(workspaces)).toBe(true);
  expect(loadCodeDrafts().get('project')?.drafts.get('game.ts')).toEqual(
    workspaces.get('project')?.drafts.get('game.ts'),
  );
  expect(loadCodeDrafts().get('project')?.drafts.has('clean.ts')).toBe(false);
  value = '{}';
  expect(loadCodeDrafts().size).toBe(0);
  vi.unstubAllGlobals();
});

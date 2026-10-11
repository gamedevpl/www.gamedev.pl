import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { writeBase } from '../checkout-sync.js';
import { readWorkspaceChanges } from './workspace-status.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'workspace-status-'));
  roots.push(root);
  const game = join(root, 'games', 'sky');
  mkdirSync(join(game, 'game'), { recursive: true });
  return { root, slug: 'sky', game };
}

it('compares deliverable files with the checkout base, including deletes and new files', () => {
  const project = checkout();
  writeBase(project.root, 'v1', [
    { path: 'game.ts', content: 'old' },
    { path: 'game/gone.ts', content: 'deleted' },
  ]);
  writeFileSync(join(project.game, 'game.ts'), 'new');
  writeFileSync(join(project.game, 'game/new.ts'), 'added');
  writeFileSync(join(project.game, 'draft.tmp'), 'keep local');
  writeFileSync(join(project.root, '.gitignore'), 'games/sky/game/ignored.ts\n');
  writeFileSync(join(project.game, 'game/ignored.ts'), 'ignored');
  mkdirSync(join(project.root, 'shared'));
  writeFileSync(join(project.root, 'shared/core.ts'), 'Kit change');
  expect(readWorkspaceChanges(project)).toEqual({
    kind: 'ready',
    version: 'v1',
    files: [
      { path: 'game.ts', kind: 'modified' },
      { path: 'game/gone.ts', kind: 'deleted' },
      { path: 'game/new.ts', kind: 'added' },
    ],
  });
  writeBase(project.root, 'v2', [
    { path: 'game.ts', content: 'new' },
    { path: 'game/new.ts', content: 'added' },
  ]);
  expect(readWorkspaceChanges(project)).toEqual({ kind: 'ready', version: 'v2', files: [] });
});

it('does not guess changes without a base or follow linked directories', () => {
  const project = checkout();
  expect(readWorkspaceChanges(null).kind).toBe('no_checkout');
  expect(readWorkspaceChanges(project).kind).toBe('no_base');
  writeBase(project.root, 'v1', []);
  const outside = checkout();
  writeFileSync(join(outside.game, 'secret.ts'), 'outside');
  symlinkSync(outside.game, join(project.game, 'linked'));
  expect(readWorkspaceChanges(project).files).toEqual([]);
  expect(readWorkspaceChanges({ ...project, slug: '../../outside' }).kind).toBe('unavailable');
});

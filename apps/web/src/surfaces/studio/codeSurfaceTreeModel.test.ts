import { describe, expect, it } from 'vitest';
import { buildSourceTree, filesUnderPrefix, movePathUnder, planFolderMove } from './codeSurfaceTreeModel.js';

describe('codeSurfaceTreeModel', () => {
  it('builds folders above files and keeps empty folders', () => {
    const tree = buildSourceTree(
      [{ path: 'game.ts' }, { path: 'game/render.ts', stagedBy: 'owner' }, { path: 'entities/player.ts' }],
      ['fx'],
    );
    expect(tree.map((node) => node.path)).toEqual(['entities', 'fx', 'game', 'game.ts']);
    const game = tree.find((node) => node.path === 'game');
    expect(game?.kind).toBe('folder');
    if (game?.kind === 'folder') {
      expect(game.children).toEqual([{ kind: 'file', name: 'render.ts', path: 'game/render.ts', stagedBy: 'owner' }]);
    }
  });

  it('plans a folder move without touching unrelated paths', () => {
    const paths = ['game.ts', 'game/render.ts', 'game/fx.ts', 'entities/player.ts'];
    expect(filesUnderPrefix(paths, 'game')).toEqual(['game/fx.ts', 'game/render.ts']);
    expect(planFolderMove(paths, 'game', 'gfx')).toEqual([
      { from: 'game/fx.ts', to: 'gfx/fx.ts' },
      { from: 'game/render.ts', to: 'gfx/render.ts' },
    ]);
    expect(movePathUnder('game/render.ts', 'game', 'gfx')).toBe('gfx/render.ts');
  });
});

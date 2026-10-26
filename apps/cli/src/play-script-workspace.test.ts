import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ignoredGameFiles, localGameFiles } from './checkout.js';

it('keeps a workspace heuristic local rather than delivering it as game source', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-strategy-workspace-'));
  try {
    const game = join(root, 'games', 'demo');
    mkdirSync(game, { recursive: true });
    writeFileSync(join(game, 'game.ts'), 'export const game = 1;');
    writeFileSync(join(game, 'play-heuristic.mjs'), 'console.log("metrics");');
    expect(localGameFiles(root, 'demo').map((file) => file.path)).toEqual(['game.ts']);
    expect(ignoredGameFiles(root, 'demo')).toContainEqual(
      expect.objectContaining({
        path: 'play-heuristic.mjs',
        source: 'not-game',
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

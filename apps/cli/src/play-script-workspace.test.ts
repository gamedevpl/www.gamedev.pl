import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { ignoredGameFiles, localGameFiles } from './checkout.js';
import { createPlayScriptClient } from './play-script-client.js';

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

it.skipIf(process.platform === 'win32')(
  'keeps the private pipe in the writable game workspace and outside delivery',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'play-strategy-workspace-'));
    const game = join(root, 'games', 'demo');
    mkdirSync(game, { recursive: true });
    writeFileSync(join(game, 'game.ts'), 'export const game = 1;');
    const setup = await createPlayScriptClient({
      cwd: game,
      call: vi.fn(),
      signal: new AbortController().signal,
      maxCalls: 5,
      timeoutMs: 60000,
      release: vi.fn(),
    });
    try {
      expect(setup.modulePath.startsWith(game + '/')).toBe(true);
      expect(localGameFiles(root, 'demo').map((file) => file.path)).toEqual(['game.ts']);
    } finally {
      setup.close();
      expect(existsSync(setup.modulePath)).toBe(false);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

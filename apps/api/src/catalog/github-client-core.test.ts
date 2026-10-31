import { expect, it, vi } from 'vitest';
import { createGitHubClient } from './github-client.js';

it.each([false, true])('bundles core dependencies and boots without require (hot=%s)', async (hot) => {
  const declaration = {
    protocol: 1,
    id: 'pilot',
    stateVersion: 2,
    observationVersion: 1,
    behavior: 'game/behavior.ts',
  };
  const files = new Map([
    ['games/pilot/index.html', '<canvas id="game"></canvas>'],
    ['games/pilot/style.css', '.game {}'],
    ['games/pilot/GAME.json', JSON.stringify({ engine: { modules: [] }, ...(hot ? { hot: declaration } : {}) })],
    ['games/pilot/game.ts', hot ? 'export default builder=>builder.init(()=>({}));' : 'GameKit.defineGame().start();'],
    ['games/pilot/game/behavior.ts', 'export default { update(){}, render(){}, snapshot(){return {}} };'],
    ['shared/game-shell.css', '.shell {}'],
    [
      'shared/modules/core.ts',
      'import { createHotResourceHub } from "./hot-resources.ts"; window.GameKit = { defineGame: createHotResourceHub };',
    ],
    [
      'shared/modules/hot-resources.ts',
      'import { createBuilder } from "./hot-builder.js"; export function createHotResourceHub() { return createBuilder(); }',
    ],
    ['shared/modules/hot-builder.ts', 'export function createBuilder() { return window.builder; }'],
  ]);
  const readText = vi.fn(async (path: string, _ref: string) => files.get(path) ?? null);
  const client = createGitHubClient({
    token: 'test-token',
    repo: 'gamedevpl/www.gamedev.pl-games',
    fetchImpl: vi.fn(async () => Response.json({ sha: 'engine-sha' })),
    files: { readText, readBytes: async () => null },
  });
  const start = vi.fn();
  const builder = {
    start,
    hot() {
      return this;
    },
    init() {
      return this;
    },
    update() {
      return this;
    },
    render() {
      return this;
    },
    snapshot() {
      return this;
    },
  };
  const sources = await client.getGameSources('main', 'pilot');
  expect(sources).not.toBeNull();
  expect(sources!.gameJs).not.toMatch(/\brequire\s*\(/);
  const window = { builder, GameKit: undefined };
  const execute = new Function('window', `with (window) { ${sources!.gameJs} }`);
  execute(window);
  expect(start).toHaveBeenCalledOnce();
  expect(readText).toHaveBeenCalledWith('shared/modules/hot-resources.ts', 'engine-sha');
  expect(readText).toHaveBeenCalledWith('shared/modules/hot-builder.ts', 'engine-sha');
  readText.mockClear();
  await client.getGameSources('main', 'pilot');
  expect(readText.mock.calls.filter(([path]) => path.startsWith('shared/'))).toEqual([]);
});

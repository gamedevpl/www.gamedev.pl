import { afterAll, beforeAll, expect, it } from 'vitest';
import { transform } from 'esbuild';
import { createGameArtifactBrowser } from '../../api/src/catalog/game-artifact-browser.js';
import { publishSnapshot } from '../../api/src/catalog/game-snapshot-publish.js';
import type { GitHubClient } from '../../api/src/catalog/github-client.js';
import type { SnapshotGame, SnapshotPointer } from '../../api/src/catalog/game-snapshot.js';
import { findChromium } from './browser.js';

const engineRef = 'a'.repeat(40);
let browser: Awaited<ReturnType<typeof createGameArtifactBrowser>>;
beforeAll(async () => {
  browser = await createGameArtifactBrowser({
    executablePath: findChromium() ?? '',
    noSandbox: process.env.E2E_CHROMIUM_NO_SANDBOX === '1',
    timeoutMs: 1500,
  });
});
afterAll(async () => {
  await browser?.close();
});

const live = `
window.__GAME_HARNESS__={ready:true,frame:0};
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
function draw(){
  const frame=++window.__GAME_HARNESS__.frame;
  ctx.fillStyle=frame%2?'yellow':'cyan';ctx.fillRect(0,0,64,64);
  requestAnimationFrame(draw);
}draw();`;

async function publish(gameJs: string) {
  let pointer: SnapshotPointer | null = null;
  const stored: SnapshotGame[] = [];
  let verifiedHtml = '';
  const client = {
    getCatalog: async () => [
      {
        slug: 'pilot',
        title: 'Pilot',
        genre: 'arcade',
        controls: 'keys',
        status: 'published',
        media: null,
        multiplayer: null,
      },
    ],
    getGameSources: async () => ({
      indexHtml: '<canvas id="game" width="64" height="64"></canvas>',
      gameJs,
      styleCss: '',
      title: null,
    }),
  } as unknown as GitHubClient;
  const result = await publishSnapshot({
    client,
    ref: engineRef,
    commitSha: engineRef,
    verifyGame: async (game) => {
      const receipt = await browser.verify(game);
      verifiedHtml = game.html;
      return receipt;
    },
    writer: {
      async putGame(_id, game) {
        stored.push(game);
      },
      async putCatalog() {},
      async putMedia() {},
      async putPointer(value) {
        pointer = value;
      },
    },
  });
  return {
    result,
    get pointer(): SnapshotPointer | null {
      return pointer;
    },
    stored,
    verifiedHtml,
  };
}

it('rejects the historical transform-with-import failure before promotion', async () => {
  const old = await transform('import { hub } from "./hot-resources.ts"; window.GameKit={hub};', {
    loader: 'ts',
    format: 'iife',
  });
  expect(old.code).toContain('require(');
  const { result, pointer, stored } = await publish(old.code + live);
  expect(result.failures[0]?.reason).toContain('require is not defined');
  expect(pointer).toBeNull();
  expect(stored).toEqual([]);
});

it('promotes the exact browser-verified final document', async () => {
  const { result, pointer, stored, verifiedHtml } = await publish(live);
  expect(result.failures).toEqual([]);
  expect(pointer?.commitSha).toBe(engineRef);
  expect(verifiedHtml).not.toBe('');
  expect(stored[0].html).toBe(verifiedHtml);
});

it.each([
  ['runtime throw', 'throw new Error("runtime failure");', 'runtime failure'],
  ['missing core', 'document.querySelector("canvas").width=64;', 'Timeout'],
  ['frozen loop', 'window.__GAME_HARNESS__={ready:true,frame:1};', 'Timeout'],
  ['keyboard error', live + "addEventListener('keydown',()=>{throw new Error('input failure')});", 'input failure'],
  [
    'error after boot',
    live.replace(
      'const frame=++window.__GAME_HARNESS__.frame;',
      "const frame=++window.__GAME_HARNESS__.frame;if(frame===4)throw new Error('late failure');",
    ),
    'late failure',
  ],
])('keeps the old pointer after %s', async (_name, code, error) => {
  const { result, pointer } = await publish(code);
  expect(result.failures[0]?.reason).toContain(error);
  expect(pointer).toBeNull();
});

it('fails when the browser is missing instead of skipping', async () => {
  await expect(createGameArtifactBrowser({ executablePath: '/missing-artifact-chromium' })).rejects.toThrow(
    'requires Chromium',
  );
});

import type { Page } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSessionBrowser } from '../../cli/src/session-browser-server.js';
import { createSessionController } from '../../cli/src/session-controller.js';
import { startLocalPlay } from '../../cli/src/play.js';
import type { ApiClient } from '../../cli/src/api.js';

export const INITIAL_CODE =
  "import { GameKit } from '../../shared/game-kit.js';\nexport const score: number = 1;\nGameKit.math.clamp(score, 0, 100);\n";
export async function playCodeFixture(funded = false) {
  const root = mkdtempSync(join(tmpdir(), 'play-code-browser-'));
  mkdirSync(join(root, 'games/demo/game'), { recursive: true });
  mkdirSync(join(root, 'tools/lib'), { recursive: true });
  mkdirSync(join(root, 'shared'));
  symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(root, 'node_modules'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(root, 'games/demo/game.ts'), INITIAL_CODE);
  writeFileSync(join(root, 'games/demo/game/logic.ts'), 'export const sibling = 2;\n');
  writeFileSync(
    join(root, 'shared/game-kit.d.ts'),
    'export declare const GameKit: { math: { clamp(value: number, min: number, max: number): number } };\n',
  );
  writeFileSync(
    join(root, 'tools/lib/assemble.ts'),
    `
import { readFileSync } from 'node:fs';
export function assembleGame(slug: string) {
  const code = readFileSync(new URL('../../games/' + slug + '/game.ts', import.meta.url), 'utf8');
  const build = /score: number = (\\d+)/.exec(code)?.[1] ?? '1';
  return { html: '<!doctype html><html><body style="color:white;background:#102020"><button id="score">Score</button><p id="build">Build '+build+'</p><script>let score=7;window.boot=crypto.randomUUID();document.querySelector("#score").onclick=()=>score++;window.__GAME_HARNESS__={ready:true,snapshotState:()=>({score}),restoreState:s=>{score=s.score;return true},validateState:s=>typeof s.score==="number",canHotReload:()=>true};<'+ '/script></body></html>' };
}`,
  );
  const session = createSessionController('Fixture');
  const completions: unknown[] = [];
  const api = {
    origin: 'http://mock-account',
    request: async (method: string, _path: string, body: unknown) => {
      if (method === 'GET') return { enabled: true };
      completions.push(body);
      return { completion: ' = 42;' };
    },
  } as ApiClient;
  const preview = await startLocalPlay({ root, slug: 'demo', env: process.env, write: () => {}, prepared: true });
  if (!preview) throw Error('No fixture preview');
  const server = await startSessionBrowser(session, {
    code: {
      checkout: () => ({ root, slug: 'demo' }),
      env: { OPENAI_API_KEY: 'mock-browser-unused' },
      ...(funded ? { platform: { api, signedIn: () => true } } : {}),
    },
    workspace: () => ({ mode: 'game', slug: 'demo' }),
  });
  server.setPreview(preview.url);
  return {
    root,
    url: server.url,
    completions,
    async close() {
      await server.close();
      session.close();
      await fetch(preview.url + 'stop', { method: 'POST', headers: { Origin: new URL(preview.url).origin } }).catch(
        () => {},
      );
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function selectCodeFile(page: Page, path: string) {
  if (!(await page.locator('.code-files-container').isVisible()))
    await page.getByRole('button', { name: 'Toggle files', exact: true }).click();
  const relative = path.replace(/^games\/[^/]+\//, '');
  const parts = relative.split('/');
  for (let i = 1; i < parts.length; i++) {
    const folder = page.locator('.code-surface-tree-folder-toggle').filter({ has: page.locator('span') });
    const toggle = folder.and(page.getByTitle(parts.slice(0, i).join('/'), { exact: true }));
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await page.locator(`.code-surface-tree-row[data-path="${relative}"] .code-surface-rail-item`).click();
}

export async function chooseCodeView(page: Page, view: string) {
  if (view === 'game') {
    const preview = page.getByRole('button', { name: 'Toggle game preview beside Code', exact: true });
    if ((await preview.getAttribute('aria-pressed')) !== 'true') await preview.click();
    await page.getByRole('button', { name: 'Maximize game', exact: true }).click();
    return;
  }
  if (view === 'panel') {
    await page.getByRole('button', { name: 'Float Code panel', exact: true }).click();
    return;
  }
  if (view === 'editor') {
    await page.getByRole('button', { name: 'Maximize Code editor', exact: true }).click();
    return;
  }
  const panel = page.locator('#code-panel');
  const current = await panel.getAttribute('data-view');
  if (current === 'panel') await page.getByRole('button', { name: 'Dock Code panel', exact: true }).click();
  const chat = page.getByRole('button', { name: 'Toggle conversation beside Code', exact: true });
  if (((await chat.getAttribute('aria-pressed')) === 'true') !== view.startsWith('editor-chat')) await chat.click();
  const preview = page.getByRole('button', { name: 'Toggle game preview beside Code', exact: true });
  if (((await preview.getAttribute('aria-pressed')) === 'true') !== view.endsWith('preview')) await preview.click();
}

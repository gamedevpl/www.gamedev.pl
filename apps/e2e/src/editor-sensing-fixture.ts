import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';

// Fitted-picture geometry, measured where layout is real.
export const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 540, height: 720 },
  { width: 640, height: 960 },
  { width: 768, height: 1024 },
  { width: 820, height: 900 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 2880, height: 1800 },
  { width: 3440, height: 1440 },
] as const;

function webCss(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../web/src/${file}`, import.meta.url)), 'utf8');
}

// tokens.css first, as main.tsx loads it: it sets border-box.
const TOKENS_CSS = webCss('core/styles/tokens.css');

// The shipped stage rules, not a copy of them.
const STAGE_CSS = webCss('surfaces/studio/studio-stage.css');

// The canvas lives inside the game iframe.
const GAME_DOC = `
  <style>html,body{margin:0;height:100%;background:#000}
  canvas{width:100%;height:100%;object-fit:contain;display:block}</style>
  <canvas id="game" width="640" height="400"></canvas>
`;

function stagePage(docked: boolean): string {
  return `
    <style>
      ${TOKENS_CSS}
      ${STAGE_CSS}
      html, body { margin: 0; width: 100%; height: 100%; }
      body { display: flex; }
      /* Scaffolding: Studio never puts the stage at the page origin. */
      .rail { flex: 0 0 96px; }
    </style>
    <div class="rail"></div>
    <div class="studio-stage-layout">
      <div class="studio-stage">
        <div class="studio-stage-frame">
          <iframe id="frame" srcdoc="${GAME_DOC.replace(/"/g, '&quot;')}"></iframe>
        </div>
      </div>
      ${docked ? `<div class="studio-edit-overlay" data-surface="docked"></div>` : ''}
    </div>
  `;
}

// An IIFE: Playwright evaluates a string as an expression.
const MEASURE = `(() => {
  const canvas = document.getElementById('game');
  const rect = canvas.getBoundingClientRect();
  const marked = canvas.__gkLogicalSize;
  const width = (marked && marked.width) || canvas.width || rect.width;
  const height = (marked && marked.height) || canvas.height || rect.height;
  if (!width || !height || !rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / width, rect.height / height);
  const insetX = (rect.width - width * scale) / 2;
  const insetY = (rect.height - height * scale) / 2;
  return { width, height, x: rect.left + insetX, y: rect.top + insetY, insetX, insetY, scale };
})()`;

export type Box = {
  width: number;
  height: number;
  x: number;
  y: number;
  insetX: number;
  insetY: number;
  scale: number;
};

// A missing box throws; an undefined one would pass every assertion.
export async function measure(page: Page, docked: boolean) {
  await page.setContent(stagePage(docked));
  await page.frameLocator('#frame').locator('#game').waitFor({ state: 'attached' });
  const inner = page.frames().find((candidate) => candidate !== page.mainFrame());
  if (!inner) throw new Error('the game frame did not mount');
  const box = (await inner.evaluate(MEASURE)) as Box | null;
  if (!box) throw new Error('the game frame reported no picture box');
  const frameRect = await page.locator('#frame').boundingBox();
  if (!frameRect) throw new Error('the game frame has no layout box');
  const overlay = docked ? await page.locator('.studio-edit-overlay').boundingBox() : null;
  return { box, frameRect, overlay };
}

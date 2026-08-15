import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';

const VIEWPORTS = [
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

const prereq = browserPrerequisite();
if (!prereq.ok) console.warn(`[e2e] SKIPPED editor sensing: ${prereq.reason}`);

describe.skipIf(!prereq.ok)('editor canvas sensing geometry', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const deviceScaleFactor of [1, 2]) {
    it(`keeps the fitted-picture center aligned at DPR ${deviceScaleFactor}`, async () => {
      const context = await browser.newContext({ deviceScaleFactor });
      const page = await context.newPage();
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.setContent(`
          <style>
            :root, body { margin: 0; width: 100%; height: 100%; }
            .stage { width: calc(100vw - 24px); height: calc(100vh - 24px); display: grid; place-items: center; }
            .frame { position: relative; width: 100%; height: 100%; display: grid; place-items: center; }
            canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
            .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
          </style>
          <div class="stage"><div class="frame"><canvas id="game" width="640" height="400"></canvas><svg class="overlay" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid meet"><rect class="silhouette" x="250" y="150" width="140" height="100" /></svg></div></div>
        `);

        const result = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game');
          const silhouette = document.querySelector<SVGRectElement>('.silhouette');
          if (!canvas || !silhouette) throw new Error('sensing fixture did not mount');
          const rect = canvas.getBoundingClientRect();
          const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
          const insetX = (rect.width - canvas.width * scale) / 2;
          const insetY = (rect.height - canvas.height * scale) / 2;
          const box = { x: rect.left + insetX, y: rect.top + insetY, scale };
          const marker = silhouette.getBoundingClientRect();
          const expected = { x: box.x + 320 * scale, y: box.y + 200 * scale };
          return {
            xError: Math.abs(marker.left + marker.width / 2 - expected.x),
            yError: Math.abs(marker.top + marker.height / 2 - expected.y),
          };
        });

        expect(result.xError, `${viewport.width}x${viewport.height} x drift`).toBeLessThanOrEqual(0.5);
        expect(result.yError, `${viewport.width}x${viewport.height} y drift`).toBeLessThanOrEqual(0.5);
      }
      await context.close();
    });
  }
});

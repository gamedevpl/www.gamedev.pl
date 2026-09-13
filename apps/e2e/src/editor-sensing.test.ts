import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';
import { VIEWPORTS, measure } from './editor-sensing-fixture.js';

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
    it(`fits the picture inside the shipped stage at DPR ${deviceScaleFactor}`, async () => {
      const context = await browser.newContext({ deviceScaleFactor });
      const page = await context.newPage();
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        const { box, frameRect } = await measure(page, false);
        const where = `${viewport.width}x${viewport.height}`;

        // Contain fits one axis and letterboxes the other.
        expect(Math.min(box.insetX, box.insetY), `${where} insets`).toBeLessThanOrEqual(0.5);
        expect(box.insetX, `${where} insetX sign`).toBeGreaterThanOrEqual(-0.5);
        expect(box.insetY, `${where} insetY sign`).toBeGreaterThanOrEqual(-0.5);

        // Two independent readings of the same layout.
        const fitted = Math.min(frameRect.width / box.width, frameRect.height / box.height);
        expect(Math.abs(box.scale - fitted), `${where} scale drift`).toBeLessThanOrEqual(0.005);
        expect(box.width * box.scale, `${where} fitted width`).toBeLessThanOrEqual(frameRect.width + 0.5);
        expect(box.height * box.scale, `${where} fitted height`).toBeLessThanOrEqual(frameRect.height + 0.5);
      }
      await context.close();
    });
  }

  it('reports a box in frame coordinates, not page coordinates', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1366, height: 768 });
    const { box, frameRect } = await measure(page, false);

    // Measured inside the iframe, so the origin is the frame's.
    const local = await page
      .frameLocator('#frame')
      .locator('#game')
      .evaluate((node) => node.getBoundingClientRect().left);
    expect(box.x - box.insetX, 'box x is frame-local').toBeCloseTo(local, 1);
    expect(frameRect.x + box.x, 'page position needs the frame offset').toBeCloseTo(frameRect.x + box.insetX, 1);
    await context.close();
  });
});

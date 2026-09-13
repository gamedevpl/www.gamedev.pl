import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';
import { VIEWPORTS, measure } from './editor-sensing-fixture.js';

const prereq = browserPrerequisite();
if (!prereq.ok) console.warn(`[e2e] SKIPPED editor dock geometry: ${prereq.reason}`);

describe.skipIf(!prereq.ok)('docked edit panel geometry', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });

  afterAll(async () => {
    await browser?.close();
  });

  // Below twice the dock width the panel covers the centre.
  it('clears the picture centre only once the stage is twice the dock wide', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const { box, frameRect, overlay } = await measure(page, true);
      const where = `${viewport.width}x${viewport.height}`;
      if (!overlay) throw new Error(`${where} rendered no docked panel`);

      // Pin the width too, so a resize is visible.
      expect(overlay.width, `${where} dock width`).toBeCloseTo(Math.min(360, viewport.width), 0);

      const centre = frameRect.x + box.x + (box.width * box.scale) / 2;
      expect(centre < overlay.x, `${where} centre clear of the dock`).toBe(frameRect.width > overlay.width * 2);
    }
    await context.close();
  });
});

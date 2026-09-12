import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { BASE_URL, browserPrerequisite, launchSiteBrowser } from './browser.js';

// Hosts iframe /play/<slug>; the card must show, never the theater.
const prereq = browserPrerequisite();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED framed-play: ${prereq.reason}`);
}

describe.skipIf(!prereq.ok)('framed play permalink', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function hostPage(): Promise<Page> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    return context.newPage();
  }

  it('shows the interstitial inside an iframe, never the theater', async () => {
    const page = await hostPage();
    await page.setContent(
      `<!doctype html><iframe src="${BASE_URL}/play/unicorn-snap" title="play" style="width:100%;height:100vh;border:0"></iframe>`,
    );
    const frame = page.frameLocator('iframe');
    await expect.poll(() => frame.locator('.framed-play').count(), { timeout: 20_000 }).toBe(1);
    expect(await frame.locator('.stage').count()).toBe(0);
    expect(await frame.locator('a[target="_blank"]').count()).toBe(1);
    expect(await frame.locator('a[target="_top"]').count()).toBe(1);
    expect((await frame.locator('a[target="_blank"]').getAttribute('rel')) ?? '').toMatch(/noopener/);
    await page.context().close();
  });
});

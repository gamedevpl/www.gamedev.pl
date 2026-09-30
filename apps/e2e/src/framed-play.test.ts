import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { BASE_URL, browserPrerequisite, launchSiteBrowser } from './browser.js';

// Hosts iframe /play/<slug>; the card must show, never the theater.

// Reserved by RFC 2606; intercepted below, never resolved.
const HOST_URL = 'https://e2e-host.invalid/';

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

  async function framedHost(): Promise<Page> {
    const page = await hostPage();
    // setContent leaves about:blank, which frame-ancestors * refuses.
    await page.route(HOST_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><iframe src="${BASE_URL}/play/unicorn-snap" title="play" style="width:100%;height:100vh;border:0"></iframe>`,
      }),
    );
    await page.goto(HOST_URL);
    return page;
  }

  async function expectInterstitial(page: Page): Promise<void> {
    const frame = page.frameLocator('iframe');
    await expect.poll(() => frame.locator('.framed-play').count(), { timeout: 20_000 }).toBe(1);
  }

  it('shows the interstitial inside an iframe, never the theater', async () => {
    const page = await framedHost();
    await expectInterstitial(page);
    const frame = page.frameLocator('iframe');
    expect(await frame.locator('.stage').count()).toBe(0);
    expect(await frame.locator('a[target="_blank"]').count()).toBe(1);
    expect(await frame.locator('a[target="_top"]').count()).toBe(1);
    expect((await frame.locator('a[target="_blank"]').getAttribute('rel')) ?? '').toMatch(/noopener/);
    await page.context().close();
  });

  // Smoke only; headless Chromium never replayed the cached-shell framing block.
  it('still shows the interstitial once the service worker controls the frame', async () => {
    const page = await framedHost();
    await expectInterstitial(page);
    const first = page.frames().find((frame) => frame.url().startsWith(BASE_URL));
    expect(first, 'play frame').toBeDefined();
    await first!.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    await page.reload();
    await expectInterstitial(page);
    const again = page.frames().find((frame) => frame.url().startsWith(BASE_URL));
    expect(await again!.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.context().close();
  });
});

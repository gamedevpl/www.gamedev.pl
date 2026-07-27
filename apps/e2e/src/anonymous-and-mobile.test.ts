import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { browserPrerequisite, collectProblems, describeProblems, launchSiteBrowser, visit } from './browser.js';

/**
 * Two audiences the signed-in desktop walk cannot speak for: a visitor who has not
 * signed in, and a phone.
 *
 * During closed beta the anonymous home is the splash (sign-in + waitlist), not the
 * arcade. A phone must still fit that landing without sideways scroll.
 */
// Gated on a browser alone, not on a credential: nothing here signs in, so a token
// requirement would skip these on any machine that has Chromium but no token.
const prereq = browserPrerequisite();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED anonymous/mobile: ${prereq.reason}`);
}

describe.skipIf(!prereq.ok)('anonymous visitors and small screens', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });

  afterAll(async () => {
    await browser?.close();
  });

  /** A context with no session cookie at all — not merely signed out in the UI. */
  async function anonymousPage(viewport: { width: number; height: number }): Promise<Page> {
    const context = await browser.newContext({ viewport });
    return context.newPage();
  }

  /**
   * Horizontal overflow is the most common mobile regression and the least likely to
   * be noticed on a desktop run: a single unwrapped element widens the document and
   * the whole page scrolls sideways.
   */
  async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }

  it('shows the closed-beta splash to an anonymous visitor', async () => {
    const page = await anonymousPage({ width: 1280, height: 900 });
    // An anonymous /api/auth/me is expected to come back unauthenticated.
    const watcher = collectProblems(page, [401]);

    await visit(page, '/', 4_000);
    await expect.poll(() => page.locator('.beta-splash').count(), { timeout: 20_000 }).toBe(1);
    expect(await page.locator('article.catalog-card').count()).toBe(0);
    // Splash offers Google sign-in; the arcade must stay walled.
    expect(await page.locator('.beta-splash__signin').count()).toBe(1);

    expect(describeProblems(watcher.drain())).toBe('');
    await page.context().close();
  });

  it('fits a phone viewport without scrolling sideways', async () => {
    const page = await anonymousPage({ width: 390, height: 844 });
    const watcher = collectProblems(page, [401]);

    await visit(page, '/', 4_000);
    await expect.poll(() => page.locator('.beta-splash').count(), { timeout: 20_000 }).toBe(1);
    // A couple of pixels is sub-pixel rounding; a real overflow is tens or hundreds.
    expect(await horizontalOverflow(page), 'splash overflows horizontally on a phone').toBeLessThanOrEqual(2);

    await visit(page, '/privacy', 4_000);
    expect(await horizontalOverflow(page), 'legal page overflows horizontally on a phone').toBeLessThanOrEqual(2);

    expect(describeProblems(watcher.drain())).toBe('');
    await page.context().close();
  });
});

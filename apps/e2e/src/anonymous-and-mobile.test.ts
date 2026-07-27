import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { collectProblems, describeProblems, e2ePrerequisites, launchSiteBrowser, visit } from './browser';

/**
 * Two audiences the signed-in desktop walk cannot speak for: a visitor who has not
 * signed in, and a phone.
 *
 * Both are the majority case for a link shared from the site, and both fail in ways
 * a signed-in 1280px run is structurally blind to — a sign-in wall on something that
 * should be public, or a layout that scrolls sideways.
 */
const prereq = e2ePrerequisites();
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

  it('lets an anonymous visitor browse the catalog and play a game', async () => {
    const page = await anonymousPage({ width: 1280, height: 900 });
    // An anonymous /api/auth/me is expected to come back unauthenticated.
    const watcher = collectProblems(page, [401]);

    await visit(page, '/', 4_000);
    await expect.poll(() => page.locator('article.catalog-card').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    // Signed out means offered a way in, not walled out.
    expect(await page.locator('button.sign-in-btn').count()).toBe(1);

    await visit(page, '/play/apex-sprint', 6_000);
    const frame = page.frames().find((f) => f !== page.mainFrame());
    expect(frame, 'anonymous visitors must still get a playable game').toBeTruthy();
    await expect.poll(() => frame!.locator('canvas').count(), { timeout: 30_000 }).toBeGreaterThan(0);

    expect(describeProblems(watcher.drain())).toBe('');
    await page.context().close();
  });

  it('fits a phone viewport without scrolling sideways', async () => {
    const page = await anonymousPage({ width: 390, height: 844 });
    const watcher = collectProblems(page, [401]);

    await visit(page, '/', 4_000);
    // A couple of pixels is sub-pixel rounding; a real overflow is tens or hundreds.
    expect(await horizontalOverflow(page), 'home page overflows horizontally on a phone').toBeLessThanOrEqual(2);

    await visit(page, '/play/apex-sprint', 6_000);
    expect(await horizontalOverflow(page), 'play view overflows horizontally on a phone').toBeLessThanOrEqual(2);

    expect(describeProblems(watcher.drain())).toBe('');
    await page.context().close();
  });
});

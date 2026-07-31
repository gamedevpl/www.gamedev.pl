import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, Page } from 'playwright-core';
import {
  collectProblems,
  describeProblems,
  e2ePrerequisites,
  launchSiteBrowser,
  signedInApiContext,
  signedInContext,
  visit,
} from './browser.js';

/**
 * The studio thread on a phone, with the things that share the screen with it.
 *
 * Separate from anonymous-and-mobile.test.ts, which is deliberately gated on a browser
 * alone so it runs anywhere Chromium exists; the studio is behind sign-in and needs a
 * token.
 *
 * What this is for: on a narrow screen the studio owns the viewport — the page does not
 * scroll, and the composer is pinned to the bottom edge. That is a good shape and it has
 * one failure mode, which shipped once already: anything else anchored to the bottom of
 * the viewport lands on top of the composer, and removing the page scroll removed the
 * only way a reader had to get out from under it. A screen with no banner on it looks
 * perfect, which is exactly why this needs a test rather than another look.
 */
const prereq = e2ePrerequisites();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED studio mobile: ${prereq.reason}`);
}

/** Everything the app anchors to the bottom of the viewport, by class. */
const BOTTOM_BARS = ['app-update', 'install-prompt'];

describe.skipIf(!prereq.ok)('the studio thread on a phone', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let page: Page;

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    const context = await signedInContext(browser, api);
    page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
  });

  afterAll(async () => {
    await browser?.close();
    await api?.dispose();
  });

  /**
   * Puts a bar on screen with the class the real one carries and reports whether it
   * covers the composer.
   *
   * Injected rather than provoked: the install nudge needs a `beforeinstallprompt` the
   * browser fires on its own terms, and the update bar needs a service worker waiting to
   * take over. Neither is summonable from a test. The class is what the stylesheet keys
   * on, so an element carrying it is exactly the contract being checked — "an element
   * with this class does not cover the composer" is the promise, and this is the promise.
   */
  async function coverageBy(bar: string): Promise<{ overlapsComposer: boolean; sendIsHittable: boolean }> {
    return page.evaluate((className) => {
      const app = document.querySelector('.app');
      const injected = document.createElement('div');
      injected.className = className;
      injected.dataset.e2eInjected = 'true';
      injected.innerHTML = '<span>A new version is ready.</span><button type="button">Reload</button>';
      app?.appendChild(injected);

      return new Promise<{ overlapsComposer: boolean; sendIsHittable: boolean }>((resolve) => {
        // Two frames: one for the append, one for the layout it causes.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const composer = document.querySelector('.status-composer.is-compact')?.getBoundingClientRect();
            const send = document.querySelector('.status-composer.is-compact .primary-btn');
            const bar = injected.getBoundingClientRect();

            let overlapsComposer = false;
            let sendIsHittable = false;

            if (composer) {
              overlapsComposer = bar.top < composer.bottom && bar.bottom > composer.top;
            }
            if (send) {
              // The question a finger asks: at the middle of the send button, what would
              // actually receive the tap? Catches any covering element, not just this one.
              const box = send.getBoundingClientRect();
              const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
              sendIsHittable = hit === send || send.contains(hit);
            }

            injected.remove();
            resolve({ overlapsComposer, sendIsHittable });
          }),
        );
      });
    }, bar);
  }

  it('keeps the composer clear of everything anchored to the bottom of the screen', async () => {
    const watcher = collectProblems(page);

    await visit(page, '/studio', 4_000);

    // The bot identity's shelf is whatever previous runs left behind. With no games there
    // is no thread and nothing to assert — say so rather than passing quietly, because a
    // guard that silently stops guarding is worse than no guard.
    const hasComposer = await page.locator('.status-composer.is-compact').count();
    if (hasComposer === 0) {
      console.warn('[e2e] studio mobile: the e2e account has no games open in the studio; composer check skipped');
      expect(describeProblems(watcher.drain())).toBe('');
      return;
    }

    // The page owning the viewport is the precondition for the rest: it is what removes
    // the scroll a reader would otherwise use to escape a bar sitting on the composer.
    const pageScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(pageScroll, 'the studio thread should own the viewport on a phone').toBeLessThanOrEqual(2);

    for (const bar of BOTTOM_BARS) {
      const { overlapsComposer, sendIsHittable } = await coverageBy(bar);
      expect(overlapsComposer, `.${bar} covers the composer on a phone`).toBe(false);
      expect(sendIsHittable, `.${bar} covers the composer's send button on a phone`).toBe(true);
    }

    expect(describeProblems(watcher.drain())).toBe('');
  });
});

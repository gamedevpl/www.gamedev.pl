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
 * The studio thread as an app screen, and the things that share the window with it.
 *
 * Separate from anonymous-and-mobile.test.ts, which is deliberately gated on a browser
 * alone so it runs anywhere Chromium exists; the studio is behind sign-in and needs a
 * token.
 *
 * What this is for: when a game is open, the studio owns the window at every width — the
 * page does not scroll, and the composer is pinned to the bottom edge. That is a good
 * shape and it has two failure modes, both of which have shipped:
 *
 *   1. Anything else anchored to the bottom of the window lands on top of the composer,
 *      and removing the page scroll removed the only way a reader had to get out from
 *      under it.
 *   2. Taking the page's scroll away without leaving the transcript a working scroller of
 *      its own cuts a long conversation off at the bottom edge with nothing to drag.
 *
 * A screen with a short thread and no banner on it looks perfect in both cases, which is
 * exactly why this needs a test rather than another look.
 *
 * The widths are not decoration. The first version of this file ran at 390 only, and the
 * next change to the shell reintroduced both failures at every width above 800 — a review
 * caught what this test was written to catch, because this test never went there. Each
 * entry below is a band the shell is assembled by different rules in.
 */
const prereq = e2ePrerequisites();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED studio shell: ${prereq.reason}`);
}

/** Everything the app anchors to the bottom of the window, by class. */
const BOTTOM_BARS = ['app-update', 'install-prompt'];

/** One per band the shell's CSS treats differently. */
const VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'narrow tablet', width: 780, height: 900 },
  // 801-900 is its own band: the phone rules stop at 800, and a legacy block that turns
  // the transcript's scroller off runs to 900. This is where both failures last hid.
  { label: 'wide tablet', width: 850, height: 900 },
  { label: 'desktop', width: 1440, height: 900 },
] as const;

describe.skipIf(!prereq.ok)('the studio thread as an app screen', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let page: Page;

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    const context = await signedInContext(browser, api);
    page = await context.newPage();
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
            const send = document.querySelector('.status-composer-send');
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

  for (const viewport of VIEWPORTS) {
    it(`keeps the conversation reachable and the composer clear on a ${viewport.label}`, async () => {
      const watcher = collectProblems(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await visit(page, '/studio', 4_000);

      // The bot identity's shelf is whatever previous runs left behind. With no games
      // there is no thread and nothing to assert — say so rather than passing quietly,
      // because a guard that silently stops guarding is worse than no guard.
      const hasComposer = await page.locator('.status-composer.is-compact').count();
      if (hasComposer === 0) {
        console.warn('[e2e] studio shell: the e2e account has no games open in the studio; layout check skipped');
        expect(describeProblems(watcher.drain())).toBe('');
        return;
      }

      const shell = await page.evaluate(() => {
        const scroller = document.querySelector('.studio-thread-scroll');
        return {
          pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
        };
      });

      // The page owning the window is the precondition for the rest: it is what removes
      // the scroll a reader would otherwise use to escape a bar sitting on the composer.
      expect(shell.pageScroll, 'the studio thread should own the window').toBeLessThanOrEqual(2);

      // And having taken that scroll away, the shell owes the transcript one. Asserted on
      // the computed style rather than on a stuffed transcript: this is the property that
      // has to hold, and it holds whether or not this account's thread happens to be long
      // enough to overflow today.
      expect(shell.scrollerOverflowY, 'the transcript needs its own scroller once the page has none').toMatch(
        /^(auto|scroll)$/,
      );

      for (const bar of BOTTOM_BARS) {
        const { overlapsComposer, sendIsHittable } = await coverageBy(bar);
        expect(overlapsComposer, `.${bar} covers the composer at ${viewport.width}px`).toBe(false);
        expect(sendIsHittable, `.${bar} covers the composer's send button at ${viewport.width}px`).toBe(true);
      }

      expect(describeProblems(watcher.drain())).toBe('');
    });
  }
});

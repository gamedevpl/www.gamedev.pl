import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, Page, Route } from 'playwright-core';
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
 *
 * Data is stubbed, not borrowed from `bot:e2e`'s shelf. The layout contract is CSS and
 * the real React tree; which games that identity happens to own is not part of it, and
 * a gate that skipped when the shelf was empty shipped the bugs above twice (#386, #391).
 * Stubbing the shelf + status responses keeps the suite read-only against production
 * (no submission, no agent build) and means an emptied shelf cannot turn the gate into
 * four green ticks that asserted nothing.
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

/** Stable ids used only inside the stubbed responses — never written to the API. */
const FIXTURE_TOKEN = 'e2e-studio-shell-token';
const FIXTURE_SLUG = 'e2e-studio-shell';
/** Enough games to trip focus mode (STUDIO_SHELF_TOOLS_AT = 5), which is the desktop
 *  path that used to re-cage the work surface after the shelf collapsed. */
const FOCUS_SHELF_SIZE = 5;

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function fixtureGames() {
  return Array.from({ length: FOCUS_SHELF_SIZE }, (_, i) => ({
    token: i === 0 ? FIXTURE_TOKEN : `${FIXTURE_TOKEN}-${i}`,
    title: i === 0 ? 'E2E Studio Shell Fixture' : `E2E Studio Shell Fixture ${i + 1}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastKnownStatus: 'published' as const,
    slug: i === 0 ? FIXTURE_SLUG : `${FIXTURE_SLUG}-${i}`,
    publishedAt: '2026-01-02T00:00:00.000Z',
  }));
}

/**
 * Give `/studio` a game with a composer without touching production shelf state.
 *
 * The SPA still mounts CreatorStudioView + SubmissionStatusView and applies the real
 * stylesheet; only the JSON those views fetch is replaced.
 *
 * Five games, not one: a single-game shelf never enters focus mode, and that is the
 * desktop state where a capped reading column used to float in empty gutters after the
 * shelf hid. Stubbing under the threshold made the gate green while the live screen
 * with a real shelf was wrong.
 */
async function stubStudioThreadData(page: Page) {
  await page.route('**/api/me/studio**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/api/me/studio/health')) {
      await fulfillJson(route, { days: [], truncated: false, games: [] });
      return;
    }
    if (path.endsWith('/api/me/studio/scorecards')) {
      await fulfillJson(route, { scorecards: [] });
      return;
    }
    if (path.endsWith('/api/me/studio')) {
      await fulfillJson(route, { games: fixtureGames() });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/submissions/${FIXTURE_TOKEN}**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"method not allowed"}' });
      return;
    }
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith(`/api/submissions/${FIXTURE_TOKEN}`)) {
      // Terminal status so the view stops polling; composer still mounts for any
      // non-abandoned state (SubmissionStatusView, embedded + compact).
      await fulfillJson(route, { status: 'published', slug: FIXTURE_SLUG });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
  });
}

describe.skipIf(!prereq.ok)('the studio thread as an app screen', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let page: Page;

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    const context = await signedInContext(browser, api);
    page = await context.newPage();
    await stubStudioThreadData(page);
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

      // The fixture must put a composer on screen. If it does not, the shell CSS under
      // test never ran — fail loudly rather than green-ticking an empty assertion.
      try {
        await page.waitForSelector('.status-composer.is-compact', { state: 'visible', timeout: 15_000 });
      } catch {
        expect.fail(
          'studio shell fixture did not open a thread with a composer — the layout gate would assert nothing',
        );
      }

      const shell = await page.evaluate(() => {
        const scroller = document.querySelector('.studio-thread-scroll');
        const detail = document.querySelector('.studio-detail');
        const layout = document.querySelector('.studio-layout');
        return {
          pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
          gameOpen: Boolean(document.querySelector('.studio-layout.is-game-open')),
          focusMode: Boolean(layout?.classList.contains('is-focus')),
          detailWidth: detail?.getBoundingClientRect().width ?? 0,
          viewportWidth: window.innerWidth,
        };
      });

      expect(shell.gameOpen, 'the studio should mark a game open so the shell CSS applies').toBe(true);
      expect(shell.focusMode, 'the fixture shelf must be large enough to enter focus mode').toBe(true);

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

      // Desktop focus mode used to leave a ~1080px column floating in gutters after the
      // shelf hid. The work surface should own the window width (padding aside).
      if (viewport.width >= 801) {
        expect(
          shell.detailWidth,
          `focus-mode work surface should be full-bleed at ${viewport.width}px, not a centred card`,
        ).toBeGreaterThan(viewport.width - 80);
      }

      for (const bar of BOTTOM_BARS) {
        const { overlapsComposer, sendIsHittable } = await coverageBy(bar);
        expect(overlapsComposer, `.${bar} covers the composer at ${viewport.width}px`).toBe(false);
        expect(sendIsHittable, `.${bar} covers the composer's send button at ${viewport.width}px`).toBe(true);
      }

      expect(describeProblems(watcher.drain())).toBe('');
    });
  }
});

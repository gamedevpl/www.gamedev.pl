import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, Page, Route } from 'playwright-core';
import {
  BASE_URL,
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
/** Enough games to trip the compact left rail (STUDIO_SHELF_TOOLS_AT = 5). */
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
    // Only game 0 exposes Code; the rest pad the shelf.
    codeSurface: i === 0,
  }));
}

// Code surface sources route, stubbed read-only (#862).
async function stubCodeSurfaceData(page: Page) {
  await page.route(`**/api/me/studio/games/${FIXTURE_SLUG}/sources**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"method not allowed"}' });
      return;
    }
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/sources/kit-declaration')) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
      return;
    }
    if (path.endsWith('/sources')) {
      await fulfillJson(route, {
        slug: FIXTURE_SLUG,
        version: '1',
        files: [{ path: 'game.ts', content: "import { startGame } from './game/runtime.ts';\n\nstartGame();\n" }],
        deleted: [],
        // agent_round: the banner state that crowded Akcje (#862).
        readOnly: true,
        reason: 'agent_round',
        staged: { totalBytes: 0, maxBytes: 200_000, maxFiles: 50, updatedAt: null },
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
  });
}

/**
 * Give `/studio` a game with a composer without touching production shelf state.
 *
 * The SPA still mounts CreatorStudioView + SubmissionStatusView and applies the real
 * stylesheet; only the JSON those views fetch is replaced.
 *
 * Five games, not one: a single-game shelf never enters the compact-rail path, and that
 * is the desktop state this gate has to keep honest (work surface beside a skinny rail,
 * not a floating card and not a "switch game" combo).
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
      // needs_changes: rail stays open; published collapses it (#739).
      await fulfillJson(route, { status: 'needs_changes', slug: FIXTURE_SLUG });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
  });

  await page.route(`**/api/games/${FIXTURE_SLUG}`, async (route) => {
    await fulfillJson(route, { slug: FIXTURE_SLUG, title: 'E2E Studio Shell Fixture', html: '<p>fixture</p>' });
  });

  await page.route('**/sw.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
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
    await stubCodeSurfaceData(page);
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

      // Expanded rail + composer — collapsed 1px clip makes stick checks nonsense.
      try {
        await page.waitForSelector('.studio-chat-rail:not(.is-collapsed)', { state: 'attached', timeout: 15_000 });
        await page.waitForSelector('.status-composer.is-compact', { state: 'visible', timeout: 15_000 });
      } catch {
        expect.fail(
          'studio shell fixture did not open a thread with a composer — the layout gate would assert nothing',
        );
      }

      const shell = await page.evaluate(() => {
        const scroller = document.querySelector('.studio-thread-scroll');
        const pad = document.querySelector('.studio-thread-scroll-pad');
        const body = document.querySelector('.studio-thread-scroll-body');
        const detail = document.querySelector('.studio-detail');
        const layout = document.querySelector('.studio-layout');
        const rail = document.querySelector('.studio-chat-rail');
        // The fixture thread is empty/short. A pad sized as a fraction of the
        // scrollport cannot create overflow by itself (percentage of H is ≤ H),
        // so "scrollHeight - clientHeight" is the wrong signal here — it would
        // stay ~0 even with a correct Claude/Cursor runway. Measure the pad
        // against the scrollport instead, and prove slack with a stand-in turn.
        let padHeight = 0;
        let scrollerClientHeight = 0;
        let slackWithTurn = 0;
        // Default stick must not land inside the runway.
        let defaultLastTurnTopRatio = 1;
        let defaultScrollRemaining = 0;
        if (scroller && pad) {
          padHeight = pad.getBoundingClientRect().height;
          scrollerClientHeight = scroller.clientHeight;
          const turn = document.createElement('div');
          turn.dataset.e2eInjected = 'true';
          // Scale the probe to the available scrollport, including compact phone sheets.
          const turnHeight = Math.min(200, Math.max(1, Math.floor(scrollerClientHeight * 0.3) || 1));
          turn.style.cssText = `height:${turnHeight}px;flex:none;`;
          const mount = body ?? pad.parentElement;
          if (mount && body) {
            body.appendChild(turn);
          } else {
            pad.before(turn);
          }
          slackWithTurn = scroller.scrollHeight - scroller.clientHeight;
          // Content-end stick, not absolute scrollHeight.
          const contentEnd = Math.max(0, scroller.scrollHeight - scroller.clientHeight - padHeight);
          scroller.scrollTop = contentEnd;
          const scrollerRect = scroller.getBoundingClientRect();
          const turnRect = turn.getBoundingClientRect();
          defaultLastTurnTopRatio =
            scrollerClientHeight > 0 ? (turnRect.top - scrollerRect.top) / scrollerClientHeight : 1;
          defaultScrollRemaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
          turn.remove();
        }
        return {
          pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
          hasScrollPad: Boolean(pad),
          hasScrollBody: Boolean(body),
          padHeight,
          scrollerClientHeight,
          slackWithTurn,
          defaultLastTurnTopRatio,
          defaultScrollRemaining,
          gameOpen: Boolean(document.querySelector('.studio-layout.is-game-open')),
          compactShelf: Boolean(layout?.classList.contains('is-compact-shelf')),
          shelfOpen: Boolean(layout?.classList.contains('is-shelf-open')),
          detailWidth: detail?.getBoundingClientRect().width ?? 0,
          viewportWidth: window.innerWidth,
          hasSwitcher: Boolean(document.querySelector('.studio-game-switcher')),
          hasShelf: Boolean(document.querySelector('.studio-shelf')),
          railCollapsed: Boolean(rail?.classList.contains('is-collapsed')),
          railHeight: rail?.getBoundingClientRect().height ?? 0,
        };
      });

      expect(shell.gameOpen, 'the studio should mark a game open so the shell CSS applies').toBe(true);
      expect(shell.railCollapsed, 'chat rail must stay expanded so stick/runway can be measured').toBe(false);
      expect(shell.railHeight, 'expanded chat rail needs a real height, not the 1px collapsed clip').toBeGreaterThan(
        120,
      );
      expect(
        shell.scrollerClientHeight,
        'transcript scrollport must be tall enough to measure stick geometry',
      ).toBeGreaterThan(80);
      expect(shell.compactShelf, 'the fixture shelf must be large enough to enter compact-rail mode').toBe(true);
      expect(shell.shelfOpen, 'compact shelf should start collapsed/closed').toBe(false);
      expect(shell.hasSwitcher, 'the switch-game combo must stay gone').toBe(false);
      expect(shell.hasShelf, 'the shelf itself must remain in the tree as a rail/drawer').toBe(true);

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

      // Claude/Cursor shape: empty runway under the turns so the last message can rise.
      expect(shell.hasScrollPad, 'transcript needs a bottom pad for last-turn scroll').toBe(true);
      expect(shell.hasScrollBody, 'transcript body anchors short threads above the composer').toBe(true);
      expect(shell.padHeight, 'bottom pad needs real height (not a zero-height spacer)').toBeGreaterThan(80);
      expect(
        shell.padHeight,
        'bottom pad should be roughly one scrollport so the last turn can rise to the top',
      ).toBeGreaterThan(shell.scrollerClientHeight * 0.5);
      expect(shell.slackWithTurn, 'with a turn above the pad, the transcript must become scrollable').toBeGreaterThan(
        80,
      );
      // Last turn stays low; runway stays below the fold.
      expect(
        shell.defaultLastTurnTopRatio,
        'default stick must keep the last turn in the lower half of the pane',
      ).toBeGreaterThan(0.4);
      expect(
        shell.defaultScrollRemaining,
        'default stick must leave the runway below the fold (not scrolled into)',
      ).toBeGreaterThan(shell.padHeight * 0.5);

      // Desktop compact rail (~56px) leaves the work surface owning the rest of the window.
      if (viewport.width >= 801) {
        expect(
          shell.detailWidth,
          `compact-rail work surface should fill the window beside the rail at ${viewport.width}px`,
        ).toBeGreaterThan(viewport.width - 120);
      }

      for (const bar of BOTTOM_BARS) {
        const { overlapsComposer, sendIsHittable } = await coverageBy(bar);
        expect(overlapsComposer, `.${bar} covers the composer at ${viewport.width}px`).toBe(false);
        expect(sendIsHittable, `.${bar} covers the composer's send button at ${viewport.width}px`).toBe(true);
      }

      // #862: padding alone left each strip pill ~24px tall below 801px.
      if (viewport.width <= 800) {
        const pillHeights = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.studio-strip-actions .studio-head-action')).map(
            (el) => el.getBoundingClientRect().height,
          ),
        );
        expect(pillHeights.length, 'the strip should still render its action pills').toBeGreaterThan(0);
        for (const height of pillHeights) {
          expect(height, `a strip action pill is only ${height}px tall at ${viewport.width}px`).toBeGreaterThanOrEqual(
            44,
          );
        }
      }

      expect(describeProblems(watcher.drain())).toBe('');
    });
  }

  /**
   * The open-game tests above wait until a composer is on screen, so they never see the
   * shelf-fetch window — which is exactly where the marketing footer used to paint and
   * then vanish. Hold `/api/me/studio` and assert the pending shell claim itself: footer
   * and lid gone, page scroll gone, bottom bars joined to the column (there is no
   * composer yet, so "covers the composer" is the wrong question — `position: static` is
   * the CSS contract that keeps them from floating over whatever comes next).
   */
  for (const viewport of VIEWPORTS) {
    it(`claims the window while the shelf loads on a ${viewport.label}`, async () => {
      const watcher = collectProblems(page);

      let releaseShelf!: () => void;
      const shelfHeld = new Promise<void>((resolve) => {
        releaseShelf = resolve;
      });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releaseShelf();
      };

      const holdShelf: Parameters<Page['route']>[1] = async (route) => {
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
          await shelfHeld;
          await fulfillJson(route, {
            games: [
              {
                token: FIXTURE_TOKEN,
                title: 'E2E Studio Shell Fixture',
                createdAt: '2026-01-01T00:00:00.000Z',
                lastKnownStatus: 'published',
                slug: FIXTURE_SLUG,
                publishedAt: '2026-01-02T00:00:00.000Z',
              },
            ],
          });
          return;
        }
        await route.fallback();
      };

      await page.route('**/api/me/studio**', holdShelf);
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // Short settle only: the shelf is held on purpose, so a long wait would just sit
        // on the pending marker. Goto + marker is the signal the shell CSS under test ran.
        await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded' });
        try {
          await page.waitForSelector('.studio-shell-pending', { state: 'attached', timeout: 15_000 });
        } catch {
          expect.fail(
            'studio shell did not mount .studio-shell-pending while the shelf was held — the loading-state gate would assert nothing',
          );
        }

        const pending = await page.evaluate(() => {
          const footer = document.querySelector('.site-footer');
          const header = document.querySelector('.studio-panel-header');
          const app = document.querySelector('.app');
          return {
            footerDisplay: footer ? getComputedStyle(footer).display : null,
            headerDisplay: header ? getComputedStyle(header).display : null,
            appOverflow: app ? getComputedStyle(app).overflow : null,
            pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            gameOpen: Boolean(document.querySelector('.studio-layout.is-game-open')),
          };
        });

        expect(pending.gameOpen, 'a game must not open while the shelf response is held').toBe(false);
        expect(pending.footerDisplay, 'the marketing footer must stay hidden during the fetch').toBe('none');
        expect(pending.headerDisplay, 'the Creator Studio lid must stay hidden during the fetch').toBe('none');
        expect(pending.appOverflow, 'the pending shell must take the page scroll away').toBe('hidden');
        expect(pending.pageScroll, 'the pending shell should own the window').toBeLessThanOrEqual(2);

        for (const bar of BOTTOM_BARS) {
          const position = await page.evaluate((className) => {
            const app = document.querySelector('.app');
            const injected = document.createElement('div');
            injected.className = className;
            injected.dataset.e2eInjected = 'true';
            app?.appendChild(injected);
            const computed = getComputedStyle(injected).position;
            injected.remove();
            return computed;
          }, bar);
          expect(position, `.${bar} should join the column while the shell is pending`).toBe('static');
        }

        release();
        try {
          await page.waitForSelector('.studio-layout.is-game-open', { state: 'attached', timeout: 15_000 });
        } catch {
          expect.fail('releasing the shelf did not open a game — pending→open handoff broke');
        }
        expect(
          await page.locator('.studio-shell-pending').count(),
          'the pending marker must leave once a game is open',
        ).toBe(0);

        expect(describeProblems(watcher.drain())).toBe('');
      } finally {
        release();
        await page.unroute('**/api/me/studio**', holdShelf);
      }
    });
  }

  // #862: no flex-wrap below 1099px let Akcje crowd the banner.
  const CODE_HEADER_VIEWPORTS = [
    { label: 'phone', width: 390, height: 844, wraps: true },
    { label: 'wide tablet', width: 850, height: 900, wraps: true },
    { label: 'desktop', width: 1440, height: 900, wraps: false },
  ] as const;

  for (const viewport of CODE_HEADER_VIEWPORTS) {
    it(`keeps the Code header wrapped and on-screen on a ${viewport.label}`, async () => {
      const watcher = collectProblems(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await visit(page, '/studio', 4_000);
      await page.waitForSelector('.status-composer.is-compact', { state: 'visible', timeout: 15_000 });

      const compact = viewport.width <= 800 || viewport.height <= 500;
      const codeToggle = compact
        ? page.getByRole('menuitem', { name: 'Code', exact: true })
        : page.locator('.studio-strip-actions button[aria-label="Code"]');
      if (compact) {
        const moreActions = page.locator('.studio-head-menu > button[aria-haspopup="menu"]');
        await moreActions.waitFor({ state: 'visible', timeout: 15_000 });
        await moreActions.click();
      }
      try {
        await codeToggle.waitFor({ state: 'visible', timeout: 15_000 });
      } catch {
        expect.fail('the Code tab toggle never appeared — the fixture game must expose codeSurface');
      }
      await codeToggle.click();

      try {
        await page.waitForSelector('.code-surface-readonly-banner', { state: 'visible', timeout: 15_000 });
      } catch {
        expect.fail('the read-only banner never rendered — the exact header state #862 fixed would go unchecked');
      }

      const geometry = await page.evaluate(() => {
        const head = document.querySelector('.code-surface-head');
        const back = document.querySelector('.code-surface-head .studio-head-action');
        const actions = document.querySelector('.code-surface-actions-trigger');
        if (!head || !back || !actions) return null;
        const headRect = head.getBoundingClientRect();
        const backRect = back.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
          headScrollWidth: head.scrollWidth,
          headClientWidth: head.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          // A wrapped Akcje sits well below the back button's row.
          akcjeWrapped: actionsRect.top - backRect.top > 8,
          actionsRight: actionsRect.right,
          headRight: headRect.right,
        };
      });

      if (!geometry) {
        expect.fail('the Code header, back button, or Akcje trigger did not mount');
        return;
      }

      expect(
        geometry.headScrollWidth,
        `code-surface-head overflows horizontally at ${viewport.width}px (${geometry.headScrollWidth} > ${geometry.headClientWidth})`,
      ).toBeLessThanOrEqual(geometry.headClientWidth + 1);
      expect(geometry.pageScrollWidth, `the page scrolls horizontally at ${viewport.width}px`).toBeLessThanOrEqual(
        geometry.viewportWidth + 1,
      );
      // Akcje's right edge must stay inside the header, wrapped or not.
      expect(
        geometry.actionsRight,
        `Akcje's right edge (${geometry.actionsRight}) sits past the head's own bound (${geometry.headRight}) at ${viewport.width}px`,
      ).toBeLessThanOrEqual(geometry.headRight + 1);

      expect(
        geometry.akcjeWrapped,
        viewport.wraps
          ? `Akcje should have dropped to its own line below ${1100}px but stayed on the back button's row`
          : `Akcje should share the back button's row above 1099px but wrapped instead`,
      ).toBe(viewport.wraps);

      expect(describeProblems(watcher.drain())).toBe('');
    });
  }
});

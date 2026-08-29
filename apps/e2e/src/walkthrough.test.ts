import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, BrowserContext, Frame, Page } from 'playwright-core';
import {
  BASE_URL,
  collectProblems,
  describeProblems,
  e2ePrerequisites,
  launchSiteBrowser,
  openPlayTheater,
  signedInApiContext,
  signedInContext,
  visit,
} from './browser.js';

/**
 * A signed-in walk through the deployed site, as the bot:e2e agent identity.
 *
 * What this suite is for: the failures that only exist once a real browser runs the
 * real bundle against the real API — a game whose canvas never boots, a route that
 * renders blank instead of a state, input that never reaches the sandboxed iframe.
 * The unit suites already cover the routing and rendering logic in isolation; none
 * of them can tell you the deployed thing works.
 *
 * See .claude/skills/browse-live-site/SKILL.md for driving this by hand.
 */
const prereq = e2ePrerequisites();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED walkthrough: ${prereq.reason}`);
}

describe.skipIf(!prereq.ok)('signed-in walkthrough', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let watcher: ReturnType<typeof collectProblems>;
  let catalog: CatalogEntry[];

  type CatalogEntry = {
    slug: string;
    title: string;
    multiplayer: { mode: string; minPlayers: number; maxPlayers: number } | null;
  };

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    context = await signedInContext(browser, api);
    page = await context.newPage();
    watcher = collectProblems(page);
    catalog = (await (await api.get('/api/catalog')).json()) as CatalogEntry[];
  });

  afterAll(async () => {
    await browser?.close();
    await api?.dispose();
  });

  const singlePlayer = () => {
    const entry = catalog.find((g) => !g.multiplayer);
    if (!entry) throw new Error('catalog has no single-player game to exercise');
    return entry;
  };

  it('renders the catalog signed in, with no page errors', async () => {
    const res = await visit(page, '/', 4_000);
    expect(res?.status()).toBe(200);

    await expect.poll(() => page.locator('article.catalog-card').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    // The session cookie actually took effect in the SPA, not just on the API.
    await expect.poll(() => page.locator('.user-name').textContent()).toBeTruthy();

    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('boots a generated game into a live canvas that can receive input', async () => {
    // Try a few games rather than pinning whichever sorts first. This test is about the
    // *player* — frame, canvas, focus delivery — and games live in a separate,
    // agent-maintained repo. Now that this suite gates deploys, letting one broken game
    // fail it would hold the website hostage to another repo's content. Whether the
    // catalog at large is broken is games-playable.test.ts's question, and it is the one
    // that blocks.
    const candidates = catalog.filter((g) => !g.multiplayer).slice(0, 3);
    expect(candidates.length, 'catalog has no single-player game to exercise').toBeGreaterThan(0);

    let frame: Frame | undefined;
    for (const candidate of candidates) {
      // /play/<slug> auto-opens the theater; the iframe mounts with GameTheater.
      await openPlayTheater(page, candidate.slug, 6_000);
      // The theater bar mounts before PublishedGameFrame attaches the iframe, so a
      // bare frames() scan right after openPlayTheater can miss a healthy game.
      const attached = await page
        .locator('iframe')
        .first()
        .waitFor({ state: 'attached', timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (!attached) continue;
      const found = page.frames().find((f) => f !== page.mainFrame());
      if (!found) continue;
      // Games run in a sandboxed iframe (allow-scripts, no allow-same-origin). The
      // canvas living inside it is the only real proof the generated bundle booted.
      const booted = await found
        .locator('canvas')
        .first()
        .waitFor({ state: 'attached', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (booted) {
        // A canvas that exists is not yet a canvas that is running. These games
        // draw everything — HUD included — into it, so the frame's innerText
        // never moves and pixels are the only readable output; a canvas still
        // producing new frames is a game that booted and kept going, which is
        // the failure this catches: a black or frozen theater.
        //
        // Inside the candidate loop, deliberately. It used to sit after it, and
        // that is how a working game blocked a deploy: apex-sprint became a
        // racer that idles at the start line until the player moves, sorted
        // first in the catalog, and every deploy failed on a game that was fine.
        // A still opening beat is a legitimate design, so it costs this game its
        // turn as the sample rather than costing the site its release. If none
        // of the three ever move, that is a real finding and still fails.
        const canvas = found.locator('canvas').first();
        const render = async () => (await canvas.screenshot()).toString('base64');
        const before = await render();
        const moving = await expect
          .poll(render, { timeout: 10_000 })
          .not.toBe(before)
          .then(() => true)
          .catch(() => false);
        if (!moving) {
          watcher.drain();
          continue;
        }
        frame = found;
        break;
      }
      watcher.drain(); // a candidate that never booted leaves noise that is not this test's finding
    }
    expect(frame, 'no sampled single-player game booted a canvas that kept drawing').toBeTruthy();

    // Deliberately *not* asserting that the picture changes in response to a
    // keystroke: most of these games animate on their own, so a pixel diff after
    // ArrowUp would pass on idle drift alone and prove nothing about input. What is
    // checkable, and what actually regresses, is delivery — GameFrame focuses the
    // iframe on load (and on srcDoc swap) so the very first keypress reaches the
    // game instead of scrolling the page behind it.
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');

    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('declares a browser-tab icon instead of falling back to /favicon.ico', async () => {
    await visit(page, '/', 3_000);

    // Found by a walkthrough, and invisible to every other check we run: the site
    // shipped manifest icons and an apple-touch-icon but no rel="icon", so desktop
    // browsers fell back to requesting /favicon.ico — which is not served. Every
    // visit paid a 404 and every tab rendered blank. The manifest does not cover
    // this; its icons are for the installed app.
    const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
    expect(href, 'no <link rel="icon"> — tabs will fall back to /favicon.ico').toBeTruthy();

    // Declared is not the same as served: a typo'd path fails exactly as silently.
    const icon = await api.get(new URL(href!, BASE_URL).toString());
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toMatch(/^image\//);
  });

  it('rewrites the /ai and /ay play aliases to the canonical /play URL', async () => {
    const { slug } = singlePlayer();

    for (const alias of ['ai', 'ay']) {
      await visit(page, `/${alias}/${slug}`, 3_000);
      // Shared links must converge on one permalink rather than fragmenting across
      // aliases (apps/web/src/core/router.ts).
      expect(new URL(page.url()).pathname).toBe(`/play/${slug}`);
    }

    watcher.drain();
  });

  it('opens a party lobby with a join link phones can actually use', async () => {
    const party = catalog.find((g) => g.multiplayer);
    if (!party) return; // catalog has no multiplayer entry; nothing to assert

    await visit(page, '/', 4_000);
    const button = page.locator('button.party-btn').first();
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // `.party-lobby` specifically, not a [class*="party"] substring match — the
    // catalog cards already carry party badges, so a loose selector is satisfied by
    // the page we started on and the lobby never has to open for the test to pass.
    await expect.poll(() => page.locator('.party-lobby').count(), { timeout: 45_000 }).toBe(1);

    // The join credential rides in the fragment so it stays out of access logs and
    // Referer headers (docs/multiplayer-plan.md §4.3) — a join URL that put the token
    // in the path would leak it, so assert the shape, not just that a link exists.
    // `.party-url` is a real <a> (clickable / copy-link); label stays scheme-less.
    const partyUrl = page.locator('a.party-url');
    const joinUrl = await partyUrl.innerText();
    expect(joinUrl).toMatch(/\/join\/[A-Z0-9]{6}#[A-Za-z0-9_-]+$/);
    const href = await partyUrl.getAttribute('href');
    expect(href).toMatch(/^https?:\/\/.+\/join\/[A-Z0-9]{6}#[A-Za-z0-9_-]+$/);
    expect(await page.locator('.party-code').innerText()).toMatch(/^[A-Z0-9]{6}$/);

    watcher.drain();
  });

  it('offers a reportable path for illegal content (DSA art. 16)', async () => {
    const { slug } = singlePlayer();
    // Report lives on the theater chrome (More menu), not the preview page.
    await openPlayTheater(page, slug, 5_000);

    // The theater bar stays visible throughout play, so the report path in More
    // never requires recovering hidden chrome first.
    await page.locator('.game-theater-bar').waitFor({ state: 'visible' });

    // A mailto, not a button — the honest MVP per ReportGameButton.tsx. The four
    // headings are what makes a notice actionable under art. 16, so an empty mail
    // body would technically "have a report path" and still fail the obligation.
    const href = await page.locator('a.report-btn').getAttribute('href');
    expect(href).toMatch(/^mailto:/);
    const decoded = decodeURIComponent(href ?? '');
    expect(decoded).toContain(`/play/${slug}`); // where
    expect(decoded).toMatch(/illegal/i); // why
    expect(decoded).toMatch(/name and email/i); // who
    expect(decoded).toMatch(/good faith/i); // good-faith statement

    watcher.drain();
  });
});

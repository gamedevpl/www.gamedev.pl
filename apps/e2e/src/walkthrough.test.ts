import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, BrowserContext, Page } from 'playwright-core';
import {
  BASE_URL,
  collectProblems,
  describeProblems,
  e2ePrerequisites,
  launchSiteBrowser,
  signedInApiContext,
  signedInContext,
  visit,
} from './browser';

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
    const { slug } = singlePlayer();
    await visit(page, `/play/${slug}`, 6_000);

    // Games run in a sandboxed iframe (allow-scripts, no allow-same-origin). The
    // canvas living inside it is the only real proof the generated bundle booted.
    const frame = page.frames().find((f) => f !== page.mainFrame());
    expect(frame, 'game iframe should exist').toBeTruthy();
    await expect.poll(() => frame!.locator('canvas').count(), { timeout: 30_000 }).toBeGreaterThan(0);

    // These games draw everything — HUD included — into the canvas, so the frame's
    // innerText never moves and pixels are the only readable output. A canvas that
    // keeps producing new frames is a game that booted and is still running, which
    // is the failure this catches: a black or frozen theater.
    const canvas = frame!.locator('canvas').first();
    const render = async () => (await canvas.screenshot()).toString('base64');
    const first = await render();
    await expect.poll(render, { timeout: 20_000 }).not.toBe(first);

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
      // aliases (apps/web/src/router.ts).
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
    // `.party-url` renders it scheme-less, hence the optional host prefix.
    const joinUrl = await page.locator('.party-url').innerText();
    expect(joinUrl).toMatch(/\/join\/[A-Z0-9]{6}#[A-Za-z0-9_-]+$/);
    expect(await page.locator('.party-code').innerText()).toMatch(/^[A-Z0-9]{6}$/);

    watcher.drain();
  });

  it('offers a reportable path for illegal content (DSA art. 16)', async () => {
    const { slug } = singlePlayer();
    await visit(page, `/play/${slug}`, 5_000);

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

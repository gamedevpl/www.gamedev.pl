import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext, Browser, BrowserContext, Page } from 'playwright-core';
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
 * The routes a visitor reaches by accident: a typo, a stale bookmark, a shared link
 * whose game was never published, an expired tracking token.
 *
 * The shared property under test is "renders a real state" — a blank page or an
 * unhandled exception is the failure, and a 4xx from the API underneath is usually
 * the *correct* half of the scenario. That distinction is why these routes get their
 * own suite with expected statuses declared, rather than being folded into the
 * happy-path walk.
 */
const prereq = e2ePrerequisites();
if (!prereq.ok) {
  console.warn(`[e2e] SKIPPED resilience: ${prereq.reason}`);
}

describe.skipIf(!prereq.ok)('error and edge routes', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let watcher: ReturnType<typeof collectProblems>;

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    context = await signedInContext(browser, api);
    page = await context.newPage();
    // 404/400 are the scenario on these routes, not the defect.
    watcher = collectProblems(page, [400, 404, 409]);
  });

  afterAll(async () => {
    await browser?.close();
    await api?.dispose();
  });

  /** Rendered text, collapsed — enough to tell "a state" from "a blank page". */
  const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();

  it('serves a real 404 for an unknown path instead of silently showing home', async () => {
    const res = await visit(page, '/this-page-does-not-exist', 2_500);

    // The status matters as much as the view: a soft-404 that answers 200 tells
    // crawlers a typo'd URL is a real page.
    expect(res?.status()).toBe(404);
    await expect.poll(() => page.locator('.not-found').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    // The URL stays visible so the visitor can see what they mistyped.
    expect(new URL(page.url()).pathname).toBe('/this-page-does-not-exist');

    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('shows an in-page error for an unknown game slug, not a crash', async () => {
    await visit(page, '/play/nope-not-a-real-game', 4_000);

    const text = await bodyText();
    expect(text.length).toBeGreaterThan(0);
    // Preview-first `/play/<slug>`: an unknown slug is a missing game page, not a
    // failed theater fetch. Keep the older "could not load / retry" wording too so
    // a loadError state (catalog fetch failure) still passes this gate.
    expect(text).toMatch(/does not exist|nie istnieje|could not load|nie udało|retry|ponów/i);

    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('rewrites legacy /draft links onto /play and stays usable', async () => {
    // `/draft/<slug>` is an inbound alias of the lifetime `/play/<slug>` permalink.
    // A published catalog game resolves to the preview page; an unknown slug still
    // shows a missing/unavailable state rather than a blank shell.
    await visit(page, '/draft/apex-sprint', 3_000);

    expect(new URL(page.url()).pathname).toBe('/play/apex-sprint');
    expect((await bodyText()).length).toBeGreaterThan(0);
    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('lands legacy /status links in Creator Studio, at the address it lives at now', async () => {
    // `/status/:token` resolves as Creator Studio (same view as `/studio/:token`).
    // An unknown token no longer renders the old "invalid tracking link" panel —
    // Studio loads the creator's shelf (empty for this bot identity) and stays usable.
    // The old link keeps working, and the bar is put back on the current address, so a
    // URL copied out of it is the one that will still mean something next year.
    await visit(page, '/status/deadbeefdeadbeef', 3_000);

    expect(new URL(page.url()).pathname).toBe('/studio/deadbeefdeadbeef');
    expect(await bodyText()).toMatch(/creator studio|studio twórcy/i);
    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('renders the join screen for an unrecognised room code', async () => {
    await visit(page, '/join/ABC123#faketoken', 3_000);

    // Reaching the form is the assertion: the credential is in the fragment, so the
    // server cannot pre-validate it and the screen must stand on its own.
    expect((await bodyText()).length).toBeGreaterThan(0);
    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('keeps the telemetry route unlisted for a non-admin identity', async () => {
    await visit(page, '/health', 3_000);

    // Unlisted, not secret: the route renders nothing and the API 404s to everyone
    // who is not an admin — including a token-authenticated bot, which is exactly
    // what this identity is (docs/agent-access-tokens.md).
    const text = await bodyText();
    expect(text).toMatch(/not found|nie znaleziono/i);
    // Whatever else it does, it must not leak the operator numbers.
    expect(text).not.toMatch(/creators|visits|retention/i);

    expect(describeProblems(watcher.drain())).toBe('');
  });

  it('serves the legal documents without a session', async () => {
    // Someone deciding whether to sign in has to be able to read what signing in
    // would mean first, so these are deliberately reachable unauthenticated.
    const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const anonPage = await anon.newPage();
    const anonWatcher = collectProblems(anonPage, [401]);

    for (const path of ['/privacy', '/terms']) {
      const res = await visit(anonPage, path, 2_500);
      expect(res?.status()).toBe(200);
      const text = (await anonPage.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(text.length).toBeGreaterThan(500);
    }

    expect(describeProblems(anonWatcher.drain())).toBe('');
    await anon.close();
  });
});

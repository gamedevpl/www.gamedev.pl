import type { APIRequestContext, Browser, BrowserContext, Frame, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { e2ePrerequisites, launchSiteBrowser, signedInApiContext, signedInContext, visit } from './browser.js';

/**
 * Are published games actually playable on this deployment?
 *
 * `walkthrough.test.ts` boots one game to prove the *player* works — the frame, the
 * canvas, focus delivery. This asks the different question the deploy gate needs
 * answered: is play broken **across the catalog**, which is what a bad deploy looks
 * like. Every other check in `deploy.yml` stops at HTTP, and proving
 * `/api/games/<slug>` returns HTML says nothing about whether that HTML runs — a CSP
 * header, a sandbox change, a bundle regression or a broken assembler each return a
 * healthy 200 and a black screen.
 *
 * The verdict is by **breadth**, and that is the whole point of this file existing
 * separately. Games live in a separate, agent-maintained repo and change independently
 * of this one, so a single broken game must not stop the website shipping — including
 * the deploy that would fix it:
 *
 *   most sampled games fail → the deploy broke play → fail (blocks promotion)
 *   exactly one fails       → that game is broken   → pass, with a loud warning
 *   only one game exists    → no warn path at all   → its failure blocks; it *is* the site
 */

/** Enough games to tell "all broken" from "one broken" without lengthening the gate much. */
const SAMPLE_SIZE = 3;

/** Summed-RGB brightness above which a pixel counts as drawn rather than background. */
const LIT_THRESHOLD = 60;

interface CanvasSample {
  /** Pixels brighter than the background — "did it draw anything at all". */
  lit: number;
  /** Order-dependent digest of the pixel data — "did what it drew change". */
  digest: number;
}

interface GameReport {
  slug: string;
  frameAppeared: boolean;
  sandbox: string | null;
  litPixels: number;
  animated: boolean;
  /** Only probed when the game looked static; see below. */
  respondedToInput?: boolean;
  note?: string;
}

const prereq = e2ePrerequisites();

/**
 * Reads the canvas from inside the game's frame.
 *
 * Works despite the frame's opaque origin (`allow-scripts` with no `allow-same-origin`)
 * because Playwright drives CDP, below the same-origin policy — verified against a real
 * sandboxed `srcdoc` frame before this was written.
 *
 * Returns a digest as well as a count because a count alone cannot see motion: a sprite
 * translating across a uniform background lights exactly as many pixels every frame, so
 * comparing counts would report a healthy game as frozen and block a good deploy. Reading
 * pixels in-frame rather than screenshotting also keeps repeated sampling cheap enough to
 * do across several games.
 */
async function sampleCanvas(frame: Frame): Promise<CanvasSample | null> {
  return frame
    .evaluate((threshold) => {
      const canvas = document.querySelector('canvas');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return null;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      let digest = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
        if (brightness > threshold) lit++;
        digest = (Math.imul(digest, 33) + brightness) | 0;
      }
      return { lit, digest };
    }, LIT_THRESHOLD)
    .catch(() => null);
}

async function inspectGame(page: Page, slug: string): Promise<GameReport> {
  const report: GameReport = { slug, frameAppeared: false, sandbox: null, litPixels: -1, animated: false };

  await visit(page, `/play/${encodeURIComponent(slug)}`, 4_000);

  const iframe = page.locator('iframe').first();
  report.sandbox = await iframe.getAttribute('sandbox').catch(() => null);

  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  if (!frame) {
    report.note = 'no game frame appeared';
    return report;
  }
  report.frameAppeared = true;

  // Three spaced samples, not two: a canvas can appear a beat late, and judging a game on
  // a sample taken before it existed reports a healthy game as dead.
  const samples: Array<CanvasSample | null> = [];
  for (let take = 0; take < 3; take++) {
    samples.push(await sampleCanvas(frame));
    if (take < 2) await page.waitForTimeout(500);
  }

  const valid = samples.filter((sample): sample is CanvasSample => sample !== null);
  if (valid.length === 0) {
    report.note = 'no canvas in the game document';
    return report;
  }

  report.litPixels = Math.max(...valid.map((sample) => sample.lit));
  report.animated = valid.length > 1 && valid[0]!.digest !== valid[valid.length - 1]!.digest;

  // A game that draws but never moves on its own is not necessarily broken — a puzzle or
  // turn-based game legitimately redraws only on input. Poke it before calling it frozen,
  // so "static by design" cannot block a deploy.
  if (!report.animated) {
    await page.keyboard.press('ArrowUp').catch(() => undefined);
    await page.keyboard.press('Space').catch(() => undefined);
    await page.waitForTimeout(400);
    const poked = await sampleCanvas(frame);
    report.respondedToInput = !!poked && poked.digest !== valid[valid.length - 1]!.digest;
    if (report.respondedToInput) report.note = 'static until input, responded when poked';
  }

  return report;
}

/**
 * Alive = sandboxed, a frame arrived, and the canvas *changed* — on its own or when poked.
 *
 * Liveness is the change, not the brightness: a dark palette can legitimately light
 * nothing above the threshold, and requiring `lit > 0` would block a deploy over an art
 * choice. A deploy that genuinely broke play leaves every canvas blank *and* frozen, which
 * this still catches. `litPixels` stays in the report purely as a diagnostic.
 */
function playable(report: GameReport): boolean {
  return (
    report.sandbox === 'allow-scripts' && report.frameAppeared && (report.animated || report.respondedToInput === true)
  );
}

describe.skipIf(!prereq.ok)('published games are playable', () => {
  let browser: Browser;
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let slugs: string[];

  beforeAll(async () => {
    api = await signedInApiContext();
    browser = await launchSiteBrowser();
    context = await signedInContext(browser, api);
    page = await context.newPage();

    // CI opens these games on every deploy. Play telemetry carries no uid by design, so
    // the `bot:` exclusion that keeps agents out of creator metrics cannot reach it —
    // dropping the beacons is the only way these plays stay out of per-game health.
    await context.route('**/api/telemetry**', (route) => route.abort());

    const catalog = (await (await api.get('/api/catalog')).json()) as Array<{
      slug: string;
      multiplayer: unknown | null;
    }>;
    // Single-player only: a party game needs a second participant to leave its lobby, so
    // a solo browser would report it dead for reasons that have nothing to do with play.
    slugs = catalog
      .filter((entry) => !entry.multiplayer)
      .map((entry) => entry.slug)
      .slice(0, SAMPLE_SIZE);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await api?.dispose();
  });

  it('play works across the catalog, not just for one game', async () => {
    expect(slugs.length, 'catalog must contain at least one single-player game').toBeGreaterThan(0);

    const reports: GameReport[] = [];
    for (const slug of slugs) {
      reports.push(await inspectGame(page, slug));
    }

    for (const report of reports) {
      console.log(
        `${playable(report) ? 'OK  ' : 'FAIL'} ${report.slug}  sandbox=${report.sandbox} ` +
          `frame=${report.frameAppeared} lit=${report.litPixels} animated=${report.animated} ` +
          `input=${report.respondedToInput ?? 'n/a'}${report.note ? `  (${report.note})` : ''}`,
      );
    }

    const broken = reports.filter((report) => !playable(report));
    const working = reports.filter(playable);

    // One broken game out of several is a games-repo problem. Say so loudly and let the
    // website ship — holding the deploy would punish this repo for another's content.
    if (broken.length === 1 && working.length > 0) {
      const failed = broken[0]!;
      console.warn(
        `::warning title=Game not playable::${failed.slug} did not run on this revision ` +
          `(lit=${failed.litPixels}, animated=${failed.animated}). The other sampled games play, ` +
          `so this is a games-repo issue rather than a deploy regression.`,
      );
      return;
    }

    expect(
      broken.map((report) => report.slug),
      `play looks broken on this revision — ${broken.length}/${reports.length} sampled games failed to run. ` +
        `Blocking promotion: a site without playable games is worth nothing.`,
    ).toEqual([]);
  }, 240_000);

  it('runs every game in a frame that cannot reach the app', async () => {
    // The repo's one non-negotiable safety invariant, asserted on the *deployed, rendered*
    // page rather than on the component in jsdom. `allow-same-origin` would hand generated
    // code this app's DOM, storage and cookies.
    const sandboxes = new Set<string | null>();
    for (const slug of slugs) {
      await visit(page, `/play/${encodeURIComponent(slug)}`, 2_000);
      // Wait for attachment before reading. On a cold start the frame arrives a moment
      // after the settle, and `getAttribute` on a not-yet-present element returns null —
      // which would read as "sandbox missing" and block promotion over a slow revision
      // rather than a real defect.
      const iframe = page.locator('iframe').first();
      await iframe.waitFor({ state: 'attached', timeout: 30_000 });
      sandboxes.add(await iframe.getAttribute('sandbox'));
    }

    expect([...sandboxes], 'every game frame must be exactly allow-scripts').toEqual(['allow-scripts']);
  }, 180_000);
});

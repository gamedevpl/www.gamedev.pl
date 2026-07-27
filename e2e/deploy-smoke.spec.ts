import { expect, test, type Frame, type Page } from '@playwright/test';

/**
 * Post-deployment checks against a candidate revision, run before traffic is promoted.
 *
 * **Playable games are the product.** A deploy that breaks play is worse than a deploy
 * that fails to ship, so everything here blocks promotion — including the assertion that
 * a game's canvas actually draws. Proving `/api/games/<slug>` returns HTML (which the
 * curl smoke already does) says nothing about whether that HTML *runs* in a browser: a
 * CSP header, a sandbox change, a bundle regression or a broken assembler all return a
 * perfectly healthy 200 and a black screen.
 *
 * The one thing that must NOT block is a single badly-written game. Games live in a
 * separate, agent-maintained repo and change independently, so one broken game is not a
 * reason to stop shipping the website. The discriminator is breadth, not assertion type:
 *
 *   several games sampled → most fail  = the deploy broke play        → BLOCK
 *                        → one fails   = that game is broken          → warn
 *
 * With a single game in the catalog there is nothing to compare against, so it blocks —
 * at that point one broken game *is* a site with no playable games.
 */

/** How many published games to sample. Enough to tell "all broken" from "one broken". */
const SAMPLE_SIZE = 3;

/** Pixel brightness above which we count a pixel as drawn rather than background. */
const LIT_THRESHOLD = 60;

interface GameReport {
  slug: string;
  shellRendered: boolean;
  sandbox: string | null;
  documentDelivered: boolean;
  litPixels: number;
  animated: boolean;
  /** Only probed when the game looked static — see `inspectGame`. */
  respondedToInput?: boolean;
  note?: string;
}

async function publishedSlugs(request: Page['request'], limit: number): Promise<string[]> {
  const res = await request.get('/api/catalog');
  expect(res.status(), 'catalog must serve anonymously — play is public').toBe(200);
  const catalog = (await res.json()) as Array<{ slug: string; status?: string }>;
  return catalog
    .filter((entry) => entry.status === 'published')
    .map((entry) => entry.slug)
    .slice(0, limit);
}

/** The game frame: the only child frame on a play route. */
async function gameFrame(page: Page): Promise<Frame | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(() => document.readyState !== 'loading' && !!document.body).catch(() => false);
      if (ready) return frame;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

interface CanvasSample {
  /** Pixels brighter than the background — "has it drawn anything at all". */
  lit: number;
  /** Order-dependent digest of the pixels — "has what it drew changed". */
  digest: number;
}

/**
 * Samples the game's canvas. Reaching into the frame works despite the opaque origin
 * because Playwright talks CDP, below the same-origin policy — verified against a real
 * sandboxed srcdoc frame before this suite was written.
 *
 * Returns a digest as well as a count, because a count alone cannot detect motion: a
 * sprite translating across a uniform background lights exactly as many pixels in every
 * frame. Comparing counts would report that game as frozen and block a perfectly good
 * deploy. The digest folds each pixel with its position, so movement changes it.
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
  const report: GameReport = {
    slug,
    shellRendered: false,
    sandbox: null,
    documentDelivered: false,
    litPixels: -1,
    animated: false,
  };

  await page.goto(`/play/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' });

  // The SPA shell itself — if the bundle 404s or throws, nothing below can pass either,
  // but this distinguishes "site is broken" from "this game is broken" in the output.
  report.shellRendered = await page
    .locator('.app, main')
    .first()
    .isVisible()
    .catch(() => false);

  const iframe = page.locator('iframe').first();
  await iframe.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  report.sandbox = await iframe.getAttribute('sandbox').catch(() => null);

  const frame = await gameFrame(page);
  if (!frame) {
    report.note = 'no game frame appeared';
    return report;
  }

  report.documentDelivered = await frame.evaluate(() => document.body.children.length > 0).catch(() => false);

  // Three spaced samples rather than two: a canvas can appear a beat late, and judging a
  // game on a sample taken before it existed would report a healthy game as dead.
  const samples: Array<CanvasSample | null> = [];
  for (let take = 0; take < 3; take++) {
    samples.push(await sampleCanvas(frame));
    if (take < 2) await page.waitForTimeout(500);
  }

  const valid = samples.filter((sample): sample is CanvasSample => sample !== null);
  if (valid.length === 0) {
    report.note = 'no canvas found in the game document';
    return report;
  }

  report.litPixels = Math.max(...valid.map((sample) => sample.lit));
  report.animated = valid.length > 1 && valid[0]!.digest !== valid[valid.length - 1]!.digest;

  // A game that draws but never moves on its own is not necessarily broken — a puzzle or
  // turn-based game legitimately redraws only on input. Poke it before concluding it is
  // frozen, so "static by design" cannot block a deploy.
  if (!report.animated) {
    await page
      .locator('iframe')
      .first()
      .click({ position: { x: 40, y: 40 } })
      .catch(() => undefined);
    for (const key of ['ArrowUp', 'ArrowRight', 'Space']) {
      await page.keyboard.press(key).catch(() => undefined);
    }
    await page.waitForTimeout(400);
    const poked = await sampleCanvas(frame);
    report.respondedToInput = !!poked && poked.digest !== valid[valid.length - 1]!.digest;
    if (report.respondedToInput) report.note = 'static until input, responded when poked';
  }

  return report;
}

test.describe('deployed site', () => {
  /**
   * Never let a CI play count as a real one.
   *
   * Play and visit telemetry are deliberately anonymous — no uid — so the `bot:` uid
   * exclusion that keeps agents out of creator metrics cannot reach them. This suite
   * opens several games on every single deploy, which at beta volumes would be a visible
   * fraction of daily plays and would quietly corrupt exactly the per-game health signal
   * the numbers exist to provide. Dropping the beacons client-side is the narrowest fix:
   * no product code changes, and nothing about the page under test differs.
   */
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/telemetry**', (route) => route.abort());
  });

  test('serves a play route inside a correctly sandboxed frame', async ({ page }) => {
    const [slug] = await publishedSlugs(page.request, 1);
    expect(slug, 'catalog must contain at least one published game').toBeTruthy();

    await page.goto(`/play/${encodeURIComponent(slug!)}`, { waitUntil: 'domcontentloaded' });

    const iframe = page.locator('iframe').first();
    await expect(iframe, 'a play route must render a game frame').toBeAttached({ timeout: 15_000 });

    // The repo's one non-negotiable safety invariant, asserted for the first time on the
    // *deployed, rendered* page rather than on the component in jsdom. `allow-same-origin`
    // would let generated code reach this app's DOM, storage and cookies.
    const sandbox = await iframe.getAttribute('sandbox');
    expect(sandbox, 'game frame must be sandboxed').toBe('allow-scripts');
    expect(sandbox ?? '', 'allow-same-origin must never appear').not.toContain('allow-same-origin');
  });

  test('published games actually run', async ({ page }, testInfo) => {
    // Several games, each loaded and sampled twice — budget accordingly.
    testInfo.setTimeout(180_000);

    const slugs = await publishedSlugs(page.request, SAMPLE_SIZE);
    expect(slugs.length, 'catalog must contain at least one published game').toBeGreaterThan(0);

    const reports: GameReport[] = [];
    for (const slug of slugs) {
      reports.push(await inspectGame(page, slug));
    }

    // "Alive" is: the frame is sandboxed, a document arrived, and the canvas *changed* —
    // either on its own or when poked. Liveness is the change, not the brightness: a game
    // with a dark palette can legitimately light no pixels above the threshold, and
    // requiring `lit > 0` would block the deploy over an art choice. A deploy that truly
    // broke play leaves every canvas both blank *and* frozen, which this still catches.
    // `litPixels` stays in the report as a diagnostic.
    const playable = (report: GameReport) =>
      report.sandbox === 'allow-scripts' &&
      report.documentDelivered &&
      (report.animated || report.respondedToInput === true);

    const working = reports.filter(playable);
    const broken = reports.filter((report) => !playable(report));

    for (const report of reports) {
      const state = playable(report) ? 'OK  ' : 'FAIL';
      console.log(
        `${state} ${report.slug}  shell=${report.shellRendered} sandbox=${report.sandbox} ` +
          `doc=${report.documentDelivered} lit=${report.litPixels} animated=${report.animated} ` +
          `input=${report.respondedToInput ?? 'n/a'}` +
          (report.note ? `  (${report.note})` : ''),
      );
    }

    // One broken game out of several is a games-repo problem, not a reason to hold the
    // website. Surface it loudly and carry on.
    if (broken.length === 1 && working.length > 0) {
      const failed = broken[0]!;
      console.log(
        `::warning title=Game not playable::${failed.slug} did not run on this revision ` +
          `(lit=${failed.litPixels}, animated=${failed.animated}). Other sampled games play, ` +
          `so this is a games-repo issue rather than a deploy regression.`,
      );
      return;
    }

    // Everything else is systemic: if the games that worked yesterday do not run now, the
    // deploy broke play, and a site without playable games is worth nothing.
    expect(
      working.length,
      `play appears broken on this revision — ${broken.length}/${reports.length} sampled games ` +
        `failed to run. This blocks promotion because playable games are the product.`,
    ).toBe(reports.length);
  });

  test('a signed-in session renders the authenticated shell', async ({ browser, request, baseURL }) => {
    const token = process.env.GAMEDEV_ACCESS_TOKEN;
    test.skip(!token, 'GAMEDEV_ACCESS_TOKEN not set — authenticated shell unverified on this run');
    // A token is a row in the deployment's own datastore, so one minted against
    // production cannot authenticate to a laptop running InMemoryStore. Skipping keeps a
    // local run honest instead of failing on a mismatch that means nothing.
    test.skip(
      /localhost|127\.0\.0\.1/.test(baseURL ?? ''),
      'local target — a deployed token does not exist in this store',
    );

    // Exchange the agent token for the cookie the SPA actually sends.
    const api = await request.post('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(api.status(), 'token must exchange for a session').toBe(200);

    const context = await browser.newContext({ storageState: await request.storageState() });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Proves the cookie is honoured by the *rendered app*, not merely by the API — the
    // closed-beta splash and the signed-in shell are different branches in App.tsx.
    await expect(page.locator('.user-name'), 'signed-in nav must render for a token session').toBeVisible({
      timeout: 15_000,
    });
    await context.close();
  });
});

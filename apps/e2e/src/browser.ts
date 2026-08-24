import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  chromium,
  request,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core';
import { inject } from 'vitest';
import { BASE_URL, proxyOptions, STORAGE_STATE_ENV } from './config.js';

// Re-exported so test files have a single import site for the whole helper surface.
export { BASE_URL, proxyOptions, STORAGE_STATE_ENV };

/**
 * Where Claude Code's remote environments pre-install Playwright's browsers.
 * `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set there too, so `playwright install`
 * is not the fallback — if this returns null the suite skips rather than trying
 * to fetch a browser that the environment has deliberately pinned.
 */
export function findChromium(): string | null {
  const explicit = process.env.E2E_CHROMIUM_PATH;
  if (explicit) return existsSync(explicit) ? explicit : null;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return null;

  // Directory name carries the build number (chromium-1194), which moves with the
  // Playwright version — glob rather than pin, and match `chromium-` exactly so the
  // headless shell (chromium_headless_shell-*) never wins: it cannot run the WebGL
  // and audio paths some generated games use.
  //
  // Sorted by build descending rather than taking readdir order, which is filesystem
  // dependent: with two builds installed, an unsorted pick means one machine tests
  // the new Chromium and another silently tests the old one.
  const candidates = readdirSync(root)
    .map((name) => /^chromium-(\d+)$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map((match) => join(root, match[0], 'chrome-linux', 'chrome'))
    .filter((path) => existsSync(path));

  return candidates[0] ?? null;
}

/**
 * Whether this suite can run at all. Both halves are environmental, not a product
 * signal, so the suite skips loudly on a miss instead of failing — same reasoning as
 * the optional authenticated smoke in .github/workflows/deploy.yml: a skipped check
 * is absence of signal, and dressing it up as a pass is the actual harm.
 */
export function e2ePrerequisites(): { ok: boolean; reason: string } {
  if (!process.env.GAMEDEV_ACCESS_TOKEN) {
    return { ok: false, reason: 'GAMEDEV_ACCESS_TOKEN not set (see docs/agent-access-tokens.md)' };
  }
  return browserPrerequisite();
}

/**
 * The weaker gate, for suites that never sign in.
 *
 * The anonymous and mobile checks build their own cookie-less contexts, so requiring a
 * credential there would skip real coverage on any machine that has a browser but no
 * token — which is most of them, and exactly the pass most likely to catch a
 * signed-out or small-screen regression.
 */
export function browserPrerequisite(): { ok: boolean; reason: string } {
  if (!findChromium()) {
    return { ok: false, reason: 'no pre-installed Chromium found (set E2E_CHROMIUM_PATH)' };
  }
  return { ok: true, reason: '' };
}

/**
 * Launch the pre-installed Chromium so it can actually reach the site.
 *
 * The two args are not optional in a proxied environment (Claude Code on the web,
 * and any sandbox that routes egress through a CONNECT proxy):
 *
 * - `proxy.server` — Chromium does not read HTTPS_PROXY from the environment the way
 *   curl and Node's fetch do. Without it every navigation dies at DNS/connect.
 * - `--ssl-version-max=tls1.2` — the non-obvious one. Chromium's default TLS 1.3
 *   ClientHello (large, carries post-quantum key shares) gets its CONNECT tunnel
 *   reset by the proxy, so *every* page load fails `net::ERR_CONNECTION_RESET`,
 *   including https://example.com, while curl to the same host succeeds. That
 *   asymmetry reads as a site outage and is not one. Capping at TLS 1.2 keeps the
 *   ClientHello small enough to tunnel.
 *
 * Never "fix" this by disabling TLS verification or unsetting HTTPS_PROXY — see
 * /root/.ccr/README.md. TLS 1.2 through the proxy is a complete and secure fix.
 *
 * Both settings are applied *only* when a proxy is configured. The TLS cap is a real
 * downgrade, not a harmless default: with no proxy in the path there is nothing to
 * work around, and pinning a laptop run to 1.2 would forgo TLS 1.3 for no reason —
 * and break outright against a host that ever requires it.
 */
export async function launchSiteBrowser(): Promise<Browser> {
  const executablePath = findChromium();
  if (!executablePath) throw new Error('no Chromium available; check e2ePrerequisites() first');

  const proxyServer = process.env.HTTPS_PROXY ?? process.env.https_proxy;

  return chromium.launch({
    executablePath,
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      ...(proxyServer ? ['--ssl-version-max=tls1.2'] : []),
    ],
  });
}

declare module 'vitest' {
  interface ProvidedContext {
    E2E_STORAGE_STATE: string;
  }
}

/**
 * Path to the session state globalSetup wrote, read the way Vitest supports.
 *
 * `inject()` is the counterpart to globalSetup's `provide()` and is the contract for
 * getting a value from setup into the workers. The `process.env` fallback is what this
 * used to rely on alone, and it only happens to work: globalSetup mutates env in the
 * main process before workers are forked, so forked workers inherit it. That is an
 * implementation detail of the pool, not a guarantee — under a pool that does not fork
 * from a mutated parent, the suite would fail with "unset" even though setup succeeded.
 *
 * Kept as a fallback rather than removed, because `inject()` throws outside a worker
 * (globalSetup itself imports this module for BASE_URL).
 */
export function storageStatePath(): string | undefined {
  try {
    const injected = inject(STORAGE_STATE_ENV);
    if (injected) return injected;
  } catch {
    // Not running inside a Vitest worker — fall through to the inherited env.
  }
  return process.env[STORAGE_STATE_ENV];
}

/**
 * An API context already carrying the bot's session cookie.
 *
 * The SPA authenticates with cookies (`credentials: 'include'`), so a bearer header on
 * the browser's requests would not do — `POST /api/auth/session` is the supported
 * bridge, and it accepts only a token, never a cookie (docs/agent-access-tokens.md).
 *
 * That exchange happens once per run in globalSetup.ts and is *reused* here rather than
 * repeated: the endpoint allows 20 per hour, and one call per test file spends the
 * budget fast enough to lock the suite out mid-iteration.
 */
export async function signedInApiContext(): Promise<APIRequestContext> {
  const storageState = storageStatePath();
  if (!storageState) {
    throw new Error(`${STORAGE_STATE_ENV} unset — globalSetup did not run or the token is missing`);
  }
  return request.newContext({ baseURL: BASE_URL, storageState, ...proxyOptions() });
}

/**
 * A browser context carrying the bot's session cookie.
 *
 * `options` merges into `newContext` — added for `serviceWorkers: 'block'`, which
 * Playwright's own docs recommend: `page.route()` misses requests once a real
 * Service Worker controls the page, even one that passes them straight through.
 */
export async function signedInContext(
  browser: Browser,
  api: APIRequestContext,
  options?: Parameters<Browser['newContext']>[0],
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: await api.storageState(),
    viewport: { width: 1280, height: 900 },
    ...options,
  });
}

export type Problem = { kind: string; text: string };

/**
 * Failures that are correct behavior, not defects. Everything here was confirmed by
 * reading the code that produces it — this list is an assertion about intent, so add
 * to it only with the same evidence, never to quiet a failure you have not explained.
 */
const EXPECTED_NOISE: { pattern: RegExp; why: string }[] = [
  {
    // ArcadeCatalog lazy-loads preview video and cancels it for cards scrolled out of
    // view. The abort is the optimisation working.
    pattern: /ERR_ABORTED/,
    why: 'catalog cancels off-screen preview media on scroll',
  },
  {
    // The telemetry route is unlisted, not secret: it answers 404 to everyone who is
    // not an admin, including a token-authenticated bot (docs/agent-access-tokens.md).
    pattern: /\/api\/admin\/telemetry\//,
    why: 'admin telemetry 404s for non-admin identities by design',
  },
  {
    // An anonymous visitor's first /api/auth/me is expected to be unauthenticated.
    pattern: /401 .*\/api\/auth\/me|\/api\/auth\/me.*401/,
    why: 'anonymous session probe is expected to be unauthenticated',
  },
  {
    // The closed-beta splash renders Google's sign-in button, and GSI initialises
    // FedCM as soon as it loads. A CI browser has no Google session, so the provider
    // either answers with an empty account list or rejects the token get with a
    // NetworkError — GSI logs both as console.error. Those are statements about
    // the browser profile, not about the button.
    //
    // Chrome logs the empty-account-list outcome two ways depending on its version:
    //   old: "[GSI_LOGGER]: FedCM Provider's accounts list is empty"
    //   new: "Provider's accounts list is empty."  (bare, no prefix)
    // Both are noise; the pattern covers both.
    //
    // Narrow on purpose: a client id or origin that is actually wrong fails
    // differently and loudly ("The given origin is not allowed for the given client
    // ID", plus a 403 on the button request), and those must keep failing the gate.
    // That pair is what wedged every deploy between 18:41 and 23:0x UTC on
    // 2026-07-27, when the candidate revision's host was missing from the OAuth
    // client's authorised JavaScript origins.
    pattern: /Provider's accounts list is empty|\[GSI_LOGGER\]: FedCM get\(\) rejects with NetworkError/,
    why: 'a fresh CI browser has no Google session, so FedCM cannot mint a token',
  },
  {
    // Newer Chromium also surfaces Google's own report-only frame-ancestors CSP when
    // GSI briefly frames accounts.google.com during button init. The directive is
    // report-only ("violation has been logged, but no further action has been taken"),
    // so the splash still works — confirmed on the 2026-08-03 #500 deploy where the
    // anonymous splash assertions passed and only this console line failed the gate.
    // Narrow to accounts.google.com + report-only wording so a real frame-ancestors
    // block on our own origin would still fail loudly.
    pattern: /Framing 'https:\/\/accounts\.google\.com\/' violates the following report-only Content Security Policy/,
    why: "GSI's report-only frame-ancestors probe on accounts.google.com; not enforced",
  },
  {
    // The companion report POST to Google's CSP collector is blocked by ORB in headless
    // Chromium (opaque cross-origin response). Same GSI init path as above; the report
    // never needed to succeed for sign-in to work.
    pattern: /csp\.withgoogle\.com\/csp\/frame-ancestors\/\S+ :: net::ERR_BLOCKED_BY_ORB/,
    why: 'Chromium ORB blocks Google CSP report beacons from headless CI',
  },
];

function isExpected(text: string): boolean {
  return EXPECTED_NOISE.some(({ pattern }) => pattern.test(text));
}

/**
 * Attach problem collection to a page. Returns a live array plus a drain() that
 * empties it, so one page can be reused across navigations without findings from an
 * earlier route leaking into a later assertion.
 *
 * `expectedStatuses` covers routes deliberately driven to a miss (a bogus slug, an
 * expired token): there the 404 is the scenario, and the thing under test is that the
 * *page* still renders a real state instead of a blank or a crash.
 */
export function collectProblems(page: Page, expectedStatuses: number[] = []) {
  const problems: Problem[] = [];
  const push = (kind: string, text: string) => {
    if (!isExpected(text)) problems.push({ kind, text: text.slice(0, 400) });
  };

  page.on('pageerror', (error) => push('pageerror', error.stack || String(error)));

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();

    // Chromium's subresource failure message ("Failed to load resource: the server
    // responded with a status of 404") names no URL in its text — the URL is in the
    // message *location*. Folding it in is not cosmetic: browser-initiated requests
    // like /favicon.ico never surface through page.on('response') at all, so without
    // this the only report of them is an unattributable line that is impossible to
    // triage and tempting to allowlist wholesale. It hid a real missing-favicon 404.
    const status = Number(text.match(/status of (\d{3})/)?.[1]);
    if (status && expectedStatuses.includes(status)) return;

    const url = message.location()?.url;
    push('console.error', url ? `${text} :: ${url}` : text);
  });

  page.on('requestfailed', (req) => push('requestfailed', `${req.url()} :: ${req.failure()?.errorText ?? ''}`));

  page.on('response', (res) => {
    if (res.status() >= 400 && !expectedStatuses.includes(res.status())) {
      push(`http.${res.status()}`, `${res.request().method()} ${res.url()}`);
    }
  });

  return {
    problems,
    drain(): Problem[] {
      return problems.splice(0, problems.length);
    },
  };
}

/** Readable failure output: `[kind] text` per line. */
export function describeProblems(problems: Problem[]): string {
  return problems.map((p) => `  [${p.kind}] ${p.text}`).join('\n');
}

/** Navigate and let the SPA hydrate and make its first data fetch. */
export async function visit(page: Page, path: string, settleMs = 3_000) {
  const response = await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(settleMs);
  return response;
}

/**
 * Open a published game's theater via `/play/<slug>` (auto-opens once catalog-ready).
 * Canonical `/:handle/:slug` stays preview-first — use those to test Play clicks.
 */
export async function openPlayTheater(page: Page, slug: string, settleMs = 4_000): Promise<void> {
  await visit(page, `/play/${encodeURIComponent(slug)}`, settleMs);
  await page.locator('.game-theater-bar').waitFor({ state: 'visible', timeout: 30_000 });
}

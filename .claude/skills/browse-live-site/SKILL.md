---
name: browse-live-site
description: Drive a real Chromium browser against the live www.gamedev.pl as the bot:e2e agent identity, signed in, to manually explore the site or check a change actually works end-to-end. Use whenever asked to "click around", "walk through", "play a game and see if it works", or otherwise manually exercise the deployed site rather than just curling the API. Covers the one non-obvious step in a Claude Code on the web session — getting Playwright's bundled Chromium through the session's HTTPS egress proxy.
---

# Browsing the live site as an agent

`docs/agent-access-tokens.md` already covers minting/using `GAMEDEV_ACCESS_TOKEN` and the
basic Playwright shape (token → `/api/auth/session` → cookie → `storageState`). Read that
first if you haven't. This skill adds the one step that doc doesn't need to cover because it's
specific to **Claude Code on the web / remote execution environments**: getting the
pre-installed Chromium to actually reach `www.gamedev.pl` through the session's egress proxy.

**Before writing a throwaway script, check `apps/e2e`.** This walkthrough is codified as a
runnable suite there (`npm run e2e` — not `npm test`, which deliberately excludes it so a
browser suite pointed at production stays out of the offline test run). Its
`apps/e2e/src/browser.ts` already
exports the launch / session / problem-collection helpers described below. Reach for a
scratch script only to explore something the suite doesn't cover — and when you find
something worth keeping, add it there rather than leaving it in `/tmp`.

## Symptom

Without the fix below, every `page.goto()` fails the same way regardless of URL (even
`https://example.com`):

```
Error: page.goto: net::ERR_CONNECTION_RESET
```

`curl` to the same host works fine. This is misleading — it looks like a site or network
outage, but it's Chromium's TLS stack, not the destination.

## Root cause

The session's outbound HTTPS goes through a local CONNECT proxy at `$HTTPS_PROXY`
(see `/root/.ccr/README.md`). Node tools (curl, fetch) negotiate TLS 1.3 through it fine.
Chromium's default TLS 1.3 ClientHello (large, includes post-quantum key shares) gets the
CONNECT tunnel reset by the proxy. Capping Chromium at TLS 1.2 avoids the oversized/PQ
ClientHello and the tunnel succeeds.

## The fix

Launch Chromium with **both** the explicit proxy server _and_ the TLS cap:

```js
import { readdirSync } from 'node:fs';

// The build number moves with the Playwright version — resolve it, never pin it.
// A hard-coded chromium-<build> path is the single most likely way this snippet
// goes stale and "fails" on a machine where Chromium is installed perfectly well.
const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const build = readdirSync(root)
  .filter((n) => /^chromium-\d+$/.test(n))
  .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0];

const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM_PATH ?? `${root}/${build}/chrome-linux/chrome`,
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--no-sandbox', '--ssl-version-max=tls1.2'],
});
```

Match `chromium-<build>` exactly rather than `chromium*`: the same directory holds
`chromium_headless_shell-*`, which cannot run the WebGL and audio paths some generated
games use. `apps/e2e/src/browser.ts` exports this as `findChromium()` — prefer importing
it over re-deriving the path.

Apply `--ssl-version-max=tls1.2` **only when a proxy is actually configured**. It is a
real downgrade, not a harmless default: with nothing intercepting the connection there is
nothing to work around, and pinning to 1.2 would forgo TLS 1.3 for no reason.

Both parts matter: `proxy.server` alone still resets (TLS version is the real blocker);
`--ssl-version-max` alone doesn't help if Chromium isn't told about the proxy in the first
place. Do not pass `--proxy-bypass-list` or otherwise try to route around the proxy — that's
the egress policy, not a bug, and bypassing it will just fail differently (DNS/connect
timeouts) or violate the session's network policy.

Do not disable TLS verification and do not unset `HTTPS_PROXY` to "fix" this — those are
never the right move (see `/root/.ccr/README.md`), and they're not needed: TLS 1.2 through
the proxy is a complete, secure fix.

If Playwright's own browser isn't installed yet, don't run `playwright install` — it's
pre-fetched at `/opt/pw-browsers` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` blocks re-fetching.
Just install `playwright-core` (not the full `playwright` package) in a scratch dir and point
`executablePath` at the pre-installed binary.

## Full recipe: signed-in session + a walkthrough

```js
import { chromium, request } from 'playwright-core';

const BASE = 'https://www.gamedev.pl';

// 1. Exchange the bearer token for a session cookie (see agent-access-tokens.md).
const api = await request.newContext({ baseURL: BASE });
const res = await api.post('/api/auth/session', {
  headers: { Authorization: `Bearer ${process.env.GAMEDEV_ACCESS_TOKEN}` },
});
if (res.status() !== 200) throw new Error(`session exchange failed: ${res.status()}`);

// 2. Launch Chromium through the proxy at TLS 1.2 (see "The fix" above for how to
//    resolve executablePath instead of pinning a build number).
const proxyServer = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  executablePath: findChromium(),
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  args: ['--no-sandbox', ...(proxyServer ? ['--ssl-version-max=tls1.2'] : [])],
});

// 3. Carry the cookie into the browser context.
const context = await browser.newContext({ storageState: await api.storageState() });
const page = await context.newPage();

// 4. Wire up problem detection BEFORE navigating — console errors, page errors,
//    failed requests, and 4xx/5xx responses are the actual signal you're looking for.
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console.error:', m.text());
});
page.on('pageerror', (e) => console.log('pageerror:', e));
page.on('requestfailed', (r) => console.log('requestfailed:', r.url(), r.failure()?.errorText));
page.on('response', (r) => {
  if (r.status() >= 400) console.log(`HTTP ${r.status()}`, r.url());
});

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000); // SPA hydration + first data fetch
await page.screenshot({ path: 'home.png' });

await browser.close();
await api.dispose();
```

## Walkthrough checklist

When asked to "explore" or "look for problems", don't stop at the home page. Useful surfaces,
roughly in order of how often they turn up real issues:

- **Home** (`/`) — scroll to the bottom too; lazy-loaded catalog cards fetch media on scroll.
- **Play a real game** (`/play/<slug>` for a `single-player` catalog entry from
  `GET /api/catalog`) — the play permalink **auto-opens** the sandboxed theater.
  Canonical `/:handle/:slug` pages stay preview-first (screenshot + Play). Click
  into the game's iframe and send keyboard input; a game that never responds to
  input is the most user-visible failure mode there is.
- **Play alias rewrite** (`/ai/<slug>` or `/ay/<slug>`) — should 30x/rewrite to the canonical
  `/play/<slug>` (see `apps/web/src/core/router.ts`).
- **Multiplayer lobby** — click "Play together" on a catalog entry with `multiplayer` set;
  check the QR/join-link screen renders and the join URL matches `/join/<CODE>#<token>`.
- **Header menu** (hamburger, top right) — items are `<button class="nav-link">`, not
  always links. Create Game / Arcade still `scrollIntoView` on home sections
  (`#hero-prompt`, `#arcade`). **Studio** navigates to `/studio` (the creator home);
  the home page only keeps a short My Games gist. Don't expect a URL change for the
  scroll items — wait for the smooth-scroll to land before screenshotting.
- **Language toggle** (EN/PL) — check strings actually swap, not just the button state.
- **Static/legal routes** — `/privacy`, `/terms`.
- **Error paths** — an unknown path (→ `notFound` view, real 404), an unknown game slug at
  `/play/<garbage>` (→ in-page "This game isn't available yet…" via UnpublishedPlayView —
  same lifetime permalink as drafts; not a crash or a blank theater),
  a legacy `/draft/<slug>` (must rewrite to `/play/<slug>`), a bogus `/status/<token>`, a
  bogus `/join/<CODE>#<token>`. These should all render a friendly state, never a blank page
  or an unhandled console exception.
- **`/health`** — renders "Not found" for a non-admin identity (including a token-authed
  bot); that's correct per `docs/agent-access-tokens.md`, not a bug.
- **Signed-out pass** — a _second_, cookie-less browser context (`browser.newContext()`
  without `storageState`) hitting the same routes. Confirms anonymous visitors get a sane
  read-only experience and that nothing meant to be gated actually renders private data.
- **Mobile viewport** (e.g. 390×844) — check `document.documentElement.scrollWidth -
clientWidth` is ~0 on both the home page and a game's play view; horizontal overflow is the
  most common mobile regression.

## Interpreting what you find

Not every console error or 404 is a bug:

- `GET .../media/gameplay.mp4` aborting is normal — the catalog lazy-loads/cancels preview
  video for off-screen cards as you scroll.
- Chromium's `Failed to load resource: the server responded with a status of NNN` console
  error names **no URL in its text** — the URL is in the message's `location().url`. Read it
  from there, or you'll be tempted to dismiss the whole shape as noise. Doing exactly that
  is how a real missing-favicon 404 survived a full manual walkthrough. Browser-initiated
  requests like `/favicon.ico` also never appear in `page.on('response')` at all, so that
  console line is their _only_ report.
- A 404 on `/api/admin/telemetry/*` from a non-admin bot identity, or on `/health` itself, is
  the intended behavior (unlisted admin route, 404s to everyone else).
- A 404 on `/api/submissions/<garbage-token>` or `/api/games/<slug>` when you deliberately
  navigated to a bogus token/slug is the expected miss path, not a defect — check that the
  _page_ still rendered a friendly empty/error state, which is the actual thing worth verifying.

Do treat as real findings: unhandled `pageerror` exceptions, a game whose canvas never
appears or never responds to input, a route that renders a blank page instead of a state,
horizontal overflow on mobile, or a 4xx/5xx on a request the page itself considers essential
(not a background poll or a lazy asset).

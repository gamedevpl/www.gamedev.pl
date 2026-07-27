# @gamedevpl/e2e

A signed-in walk through the **deployed** site in a real browser.

Everything else in this repo tests code in isolation. This suite tests the thing users
actually get: the built bundle, served by the real API, with a generated game booting in
a sandboxed iframe. It exists for the failures that only appear there — a game whose
canvas never starts, a route that renders blank instead of a state, a missing tab icon
costing every visit a 404.

## Running it

```bash
GAMEDEV_ACCESS_TOKEN=gdpl_pat_… npm run e2e
```

Note the script is `e2e`, not `test`. That is deliberate: the root `npm run test` fans out
across workspaces with `--if-present`, and a browser suite pointed at a real deployment does
not belong in a run people expect to be offline, fast, and about the working tree. Anyone
holding a token would otherwise put every local `npm test` on the network — and see it fail
whenever the deployed site lags their branch.

Both prerequisites are environmental, and a miss **skips loudly** rather than failing —
same reasoning as the optional authenticated smoke in `.github/workflows/deploy.yml`: a
skipped check is absence of signal, and reporting it as a pass is the actual harm.

| Requirement            | Why                                                                                                    | If missing  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| `GAMEDEV_ACCESS_TOKEN` | Signs in as a `bot:` identity — see [`docs/agent-access-tokens.md`](../../docs/agent-access-tokens.md) | Suite skips |
| A Playwright Chromium  | Driven headless; found under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`)                   | Suite skips |

Overrides: `E2E_BASE_URL` (default `https://www.gamedev.pl`) to point at a candidate
revision, `E2E_CHROMIUM_PATH` to name a browser binary explicitly.

Because it needs a credential, this suite **does not run in normal PR CI** — it skips
there. Run it against a candidate URL before promoting a deploy, or by hand while
working on the front end.

## One token exchange per run

`POST /api/auth/session` is rate limited to **20 per hour**, and that budget is shared
with anything else using the same token. `src/globalSetup.ts` therefore exchanges once per
run and hands the session state to every test file; nothing else may call that endpoint.

This is worth knowing because of how the limit fails: it answers `429`, which reads as an
expired or revoked credential. If a run suddenly cannot sign in, check the status code
before reaching for `token:mint` — minting a second token does not buy more budget and
leaves you with two credentials to revoke.

## It talks to production

The default `E2E_BASE_URL` is the live site. The tests are read-only by design: they
browse, play, and inspect, but never submit an idea (which would spend real generation
quota) and never write catalog state. Keep it that way — if you need to exercise the
creation flow, point `E2E_BASE_URL` at a candidate revision first.

## The proxy gotcha

In a sandboxed environment that routes egress through a CONNECT proxy (Claude Code on
the web, among others), Chromium needs two launch settings or **every** navigation fails
`net::ERR_CONNECTION_RESET` — including `https://example.com`, while `curl` to the same
host succeeds. That asymmetry reads as a site outage and is not one.

`src/browser.ts` applies both:

- `proxy: { server: HTTPS_PROXY }` — Chromium does not read the env var the way curl does.
- `--ssl-version-max=tls1.2` — the non-obvious one. Chromium's default TLS 1.3
  ClientHello (large, carries post-quantum key shares) gets its tunnel reset by the proxy.

Never work around this by disabling TLS verification or unsetting `HTTPS_PROXY`. See
[`.claude/skills/browse-live-site/SKILL.md`](../../.claude/skills/browse-live-site/SKILL.md)
for driving the same setup by hand.

## Adding a test

Two rules, both learned the hard way:

**Assert what you can actually verify.** The games are AI-generated; their HUD copy, art,
and scoring are not a contract. "The canvas keeps producing frames" is checkable across
any game. "The score went up when I pressed a key" is not — most of these games animate
on their own, so that assertion passes on idle drift and proves nothing.

**Explain every entry you add to `EXPECTED_NOISE`.** It is an assertion about intent, so
each pattern needs the code that produces it. The bar matters: a `Failed to load
resource` line carries no URL in its text, and allowlisting the whole shape — the
tempting shortcut — is what hid the missing-favicon 404 through an entire manual
walkthrough. `collectProblems` now folds in the console message's location URL so these
stay triageable.

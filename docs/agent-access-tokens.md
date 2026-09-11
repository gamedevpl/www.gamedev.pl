# Personal access tokens — how an agent authenticates without a browser

> Status: ✅ **Implemented on this branch** — pending merge to `master`.

## The problem

Sign-in is Google-only. A coding agent working in a cloud VM — Claude Code on the web,
Copilot's coding agent, a Codex container, CI — has no browser session, no Gmail
account, and no way to get one. So an agent could build and unit-test the product but
never _use_ it: every authenticated route (creating, revising, notifications, votes,
party mode) was unreachable, and every change to that half of the app shipped unverified
against the real thing.

`POST /api/auth/dev` solves this on a laptop and is deliberately 404 in production, so it
does not help against the deployed site.

## What was rejected, and why it matters

Three obvious options were considered first. Recording why they lost is the point of this
section — each is the thing someone will propose again in six months.

| Option                                      | Why not                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A secret-gated "test login" route in prod   | It is a bypass whatever it is named. In an open-source repo, obscuring the name is worse than the bypass: the code is public either way, and the people misled are our own reviewers.         |
| Driving the Google login UI with Playwright | Google blocks automated sign-in (the "browser may not be secure" wall), datacenter IPs trigger CAPTCHA and phone verification, and it means putting a real Google password in every agent VM. |
| Email + password accounts                   | A real product feature, but it creates a password database — a permanent breach liability — plus registration, verification, reset and brute-force defense, all to solve a testing problem.   |

A token issued **to a real account** avoids all three: no bypass route, no Google
credential in the VM, no password to store. It is also simply the right credential for a
machine — the same reason GitHub removed password auth for automation and replaced it with
personal access tokens.

## Shape

```
gdpl_pat_<16 hex id>_<43 char base64url secret>
```

The id travels in the clear and is the lookup key; only the secret half is a credential.
What is stored is `sha256(secret)` in a top-level `accessTokens` collection — the token
itself is never written down, so a dump of the datastore yields nothing usable.

SHA-256 rather than argon2/scrypt is correct here and would be wrong for a password: the
secret is 256 bits of CSPRNG output, so there is no guessable input for stretching to slow
down.

Tokens live in their own collection rather than on the user document for a blunt reason:
`User` objects are returned to browsers by `/api/auth/me`, and a credential record riding
along on the user is one forgotten `delete` away from being served to a client.

## Properties

- **It is not a bypass.** The token authenticates _as an account_, with that account's
  tier, quota, and walls. There is no synthetic identity and no route that grants a
  session from nothing.
- **Revocation is a delete**, not a flag — the record _is_ the token's existence, so there
  is no revoked-but-still-verifiable state to get wrong. It takes effect on the next
  request, with no redeploy (unlike rotating an environment secret).
- **A token can never mint another token.** Issuing requires an admin _session_; a
  request authenticated with a token gets 404 from every operator surface, even when the
  token belongs to an admin. One leaked credential cannot become self-renewing.
- **Expiry is mandatory**, 90 days by default and 365 at most.
- **Bounded blast radius.** The worst case for a leaked token is someone acting as that
  one account — the same as a leaked session cookie, and strictly less than a leaked
  shared secret that mints sessions for anyone.
- **No new deployment secret.** Nothing new goes in Cloud Run's env or Secret Manager.

## The `bot:` namespace

Automation accounts use `bot:<handle>`, alongside `g:` (Google) and `dev:` (local).

Minting can create a `bot:` account but refuses to invent any other namespace. That rule
is a typo guard with teeth: without it, a mistyped `g:<sub>` would silently call an
account into being that never signed in, never passed the beta allowlist, and now holds a
working credential.

The prefix is also what lets product measurement tell bots from people — the creator
metrics exclude `bot:` submissions, and a token-authenticated request never records an
`activeDays` entry, so an agent on a cron cannot report perfect retention for an account
that is not a person.

## Issuing a token (operator)

Two paths, both calling the same `mintAccessTokenFor` so the rules cannot drift.

**CLI — no browser needed.** Talks to Firestore with your ambient gcloud credentials, the
same way `beta:approve` does. Check `gcloud config get-value project` first; there is no
dev/prod switch.

```bash
npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "claude cloud vm"
npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "ci" --days 30
npm run token:list   -w @gamedevpl/api -- bot:e2e
npm run token:revoke -w @gamedevpl/api -- <tokenId>
```

**HTTP — for anyone already signed in as an admin.** Requires an `ADMIN_UIDS` session;
answers 404 to everyone else, including a token-authenticated admin.

```
POST   /api/admin/access-tokens          {"uid":"bot:e2e","name":"ci","expiresInDays":30}
GET    /api/admin/access-tokens?uid=bot:e2e
DELETE /api/admin/access-tokens/<tokenId>
```

The token is readable exactly once, in the mint response. Nothing stores it — a caller who
loses it revokes and mints again.

**Self-service HTTP — the account holder, session only.** Same `mintAccessTokenFor` rules
and the same per-account cap. `POST /api/me/access-tokens` requires `authMethod ===
'session'` (a browser cookie). A PAT or a `creator`-scoped OAuth token gets 404 — a
token can never mint a token.

```
POST   /api/me/access-tokens             {"name":"ci","expiresInDays":30}
GET    /api/me/access-tokens
DELETE /api/me/access-tokens/<tokenId>
```

## Where the token lives

**One token per environment, never one shared token.** Revocation is per-token, so a
shared token leaked from anywhere forces revoking it everywhere — and `token:list`
cannot tell you which copy leaked, because they are the same row. Minted per home and
named for it, the listing becomes an inventory and `lastUsedAt` shows which ones are
dead weight before you revoke:

```bash
npm run token:mint -w @gamedevpl/api -- bot:e2e   --name "claude web env" --days 90
npm run token:mint -w @gamedevpl/api -- bot:ci    --name "github actions" --days 30
npm run token:mint -w @gamedevpl/api -- bot:local --name "owner laptop"   --days 90
```

Where each one goes, always as `GAMEDEV_ACCESS_TOKEN`:

- **Claude Code on the web** — the environment's own env-var settings, alongside its
  setup script and network policy (docs: code.claude.com). If
  `curl https://www.gamedev.pl/api/health` fails from inside the VM, that is the
  environment's outbound network policy, not the token — check it before debugging the
  credential.
- **A laptop** — shell profile, or a `.env` in the repo (already gitignored).
- **GitHub Actions** — a repository secret, read as
  `${{ secrets.GAMEDEV_ACCESS_TOKEN }}`. Actions keeps secrets away from fork-PR
  workflows, so this is safe by default. The deploy workflow already consumes it: see
  the authenticated smoke below.
- **Copilot's coding agent** — deliberately **no**. The `copilot-orchestration`
  playbook already rules it out ("never route credential handling through an autonomous
  PR agent"), Copilot's sandbox firewall blocks the site by default anyway, and Copilot
  works on a local checkout where `/api/auth/dev` costs nothing.

Prefer a short `--days` for anything automated: a 30-day CI token that expires loudly is
a better failure than one that quietly works forever. **Never commit a token** — the
repo's gitleaks config and the generated-game credential scanner both know the
`gdpl_pat_` shape, but those are backstops, not the plan. Keep it in headers, never in
URLs, which end up in logs and shell history.

## Using a token (agent)

**API calls** — send it as a bearer token; that is the entire integration:

```bash
curl -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" https://www.gamedev.pl/api/auth/me
```

**Driving a real browser** — the SPA authenticates with cookies
(`credentials: 'include'`), so exchange the token for a session first.
`POST /api/auth/session` accepts only a token (never a cookie, so a session can never
launder itself into a fresh one) and returns the cookie the SPA needs. It is a normal
session for that account in every way the app cares about, with one deliberate
exception: it records that it came from a token, so it keeps getting 404 from the
operator surfaces exactly as the Bearer header does. Without that the exchange would be
a way around "a token can never mint another token" above — trade an admin account's
token for a cookie, and mint again. The verified Playwright shape:

```js
import { chromium, request } from 'playwright-core';

const api = await request.newContext({ baseURL: 'https://www.gamedev.pl' });
await api.post('/api/auth/session', {
  headers: { Authorization: `Bearer ${process.env.GAMEDEV_ACCESS_TOKEN}` },
});

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext({ storageState: await api.storageState() });
const page = await context.newPage();
await page.goto('https://www.gamedev.pl'); // renders signed in
```

Playwright's API context keeps its own cookie jar; `storageState()` carries the session
into the browser. Exchange once per run, not per page — the session lasts 12 hours and
`/api/auth/session` shares the 20/hour/IP auth limiter.

Traps, in the order an agent will hit them:

- **The cookie is `HttpOnly` — `document.cookie` cannot set it.** A page seeded that way
  silently stays logged out with no error. Go through a browser-level API:
  `storageState` as above, or `context.addCookies([...])` with `httpOnly: true` if the
  `Set-Cookie` came from curl.
- **Do not add Playwright to the repo's `package.json`.** This app has no e2e harness by
  design; install `playwright-core` in a scratch directory instead. A dependency edit
  without a regenerated lockfile passes every local check and kills CI at `npm ci` — the
  exact failure the `verify-agent-work` playbook records.
- **No `playwright install`.** Chromium is preinstalled in agent VMs
  (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); pass `executablePath` if your
  Playwright version doesn't auto-find it.
- **Production cookies carry `Secure`** — they travel over HTTPS only, so the same
  script pointed at a plain-HTTP host will not authenticate.

**Signing in as a human, in a browser** — `/oauth/token-login` is the same exchange
with a form instead of a header. Paste the token, get the session cookie, land in the
studio (or back at `/oauth/authorize`, if that is where you came from).

It exists because sign-in on this site is Google or Apple and nothing else. That is fine
for creators and useless for anyone who has to reach the OAuth consent screen without a
Google account — a marketplace reviewer testing the MCP connector, most immediately, and
OpenAI's plugin review explicitly forbids 2FA and account creation on a test credential.
Handing over a shared Google login would mean disabling 2FA on an account Google will
challenge anyway the moment it is used from an unfamiliar IP.

The page adds no authority: it is `POST /api/auth/session` with a form on the front, the
cookie carries the same `src: 'token'` stamp, and the operator surfaces refuse it
identically. It is **not** the bypass route `AGENTS.md` says does not exist — there is
still no way in without a token, and a token still only exists because an operator minted
one. That is what stands in for registration: no signup, because the credential cannot be
self-served.

Practical notes:

- **Not linked from anywhere**, and `noindex`. Reviewers get the URL out of band.
- **Give it its own account and its own expiry.** `npm run token:mint -w @gamedevpl/api --
--uid bot:reviewer --name "openai review" --days 30` scopes the blast radius to one
  account holding nothing but sample games, and expires it on the review window rather
  than the 90-day default.
- **Revoking the token does not revoke OAuth grants approved during that session.** The
  grant is its own record with its own lifetime. Close a review by revoking the token
  _and_ removing the grant in Studio → connected apps.
- The form carries a per-browser CSRF nonce in a `SameSite=Strict` cookie, valid an hour,
  so a page left open overnight needs a reload. It has to be per-browser, not merely
  per-hour: a nonce anyone could fetch for themselves is one an attacker can put in a
  cross-site form, and the next thing this flow does is ask the browser to approve
  durable write access.

## CI: the authenticated deploy smoke

`deploy.yml` runs two layers of this on every candidate revision, **before traffic
moves**:

- **Always, no secret needed:** a forged `gdpl_pat_`-shaped bearer token must get 401
  from `/api/auth/me` — the token path fails closed, proven on every deploy. (The forged
  value is assembled at runtime in the workflow, because a well-formed literal would
  rightly trip gitleaks.)
- **When the `GAMEDEV_ACCESS_TOKEN` repo secret exists:** bearer `/api/auth/me` → 200,
  the uid **must be `bot:`-namespaced** (a human token pasted into CI is rejected rather
  than polluting creator metrics on every deploy), then the token→cookie exchange and a
  session-walled route (`/api/notifications`) → 200. Any failure blocks promotion; the
  live revision keeps serving.

Without the secret the step skips with a loud `::notice::` rather than passing silently
— a skipped check is absence of signal, not a pass. Two consequences to know about:

- **An expired CI token fails deploys.** Deliberate: credential expiry should be a
  visible event. Fix by minting a fresh one (`--days 30` for CI) and updating the
  secret; or delete the secret to fall back to skipping.
- Secrets are snapshotted per-run — a deploy racing a secret update bakes in the old
  value (a failure mode this repo has hit with vars before; see the
  `verify-agent-work` playbook). Re-run the workflow after changing the secret.

## Where this does and does not apply

Testing **local changes** does not need a token at all — `npm run dev` plus
`POST /api/auth/dev` is faster, runs against the in-memory store, and touches nothing
real. Reach for a token when the thing under test is the deployed site: real Firestore,
the real generation pipeline, the real beta walls, the real CDN.

A token-authenticated bot **passes the private-beta wall** even though it is not on the
beta allowlist. That is intended, not a hole: the allowlist gates _sign-in_, and an admin
issuing a credential is an admission decision in itself.

## Operational notes

- **Firestore:** one new collection, `accessTokens`, keyed by token id. No index needed —
  the hot path is a point read, and listing filters by `uid` and sorts in memory.
  Expired tokens are already refused at auth. A Firestore TTL policy would **not**
  self-clean these rows today: `expiresAt` is stored as an ISO string, and TTL only
  watches Timestamp/Date fields (telemetry writes `expiresAt` as a `Date` for that
  reason). Housekeeping would need a separate Timestamp field, or a sweep.
- **Auditing:** every record carries `createdByUid` (an admin uid, or `cli:<user>`) and a
  day-resolution `lastUsedAt`, so you can see who issued a token and whether anything
  still uses it before revoking.
- **Rate limits:** `/api/auth/session` shares the auth limiter (20/hour/IP). Bearer-
  authenticated API calls are not separately limited beyond each route's own limits —
  exchange once and reuse the cookie rather than exchanging per request.
- **Rotation:** mint the new token, update the agent environment, revoke the old id. There
  is no window where both must be valid, so no coordination is needed.

## Code map

| File                                            | What it holds                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/platform/access-token.ts`         | Pure format, mint, hash, verify — no I/O                            |
| `apps/api/src/platform/access-token-service.ts` | Shared issuance rules (namespace, cap, expiry) and token resolution |
| `apps/api/src/platform/access-token-routes.ts`  | Operator HTTP surface                                               |
| `apps/api/src/platform/auth.ts`                 | Bearer resolution in the `onRequest` hook; `POST /api/auth/session` |
| `apps/api/src/platform/oauth-token-login.ts`    | `/oauth/token-login` — the same exchange as a browser form          |
| `apps/api/scripts/access-token.ts`              | The `token:mint` / `token:list` / `token:revoke` CLI                |

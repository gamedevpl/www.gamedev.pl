# Auth & per-user usage: plan (v2 — rethought)

> Status: ✅ **Live in production** (verified 2026-07-26). Google sign-in, sessions, the
> closed-beta allowlist and per-user daily quotas all run on the deployed service. Goal, as
> achieved: no anonymous creation or account-owned interaction; operator-selected promotional
> games may still be played anonymously; every submission attributable to a signed-in user.
>
> The HTTP Basic Auth outer wall this plan assumed is **gone** — access is gated by
> `PRIVATE_BETA` and the allowlist instead (see [`deployment.md`](./deployment.md)). Locally,
> where real Google OAuth is unavailable, `POST /api/auth/dev` mints a session for a synthetic
> account; it answers 404 in production (see [`local-development.md`](./local-development.md)).

## What changed in the rethink (v1 → v2)

1. **Provider: Google, decided (owner call).** A GitHub-first variant was considered and
   rejected: GitHub is an **implementation detail** of the build pipeline — users describe a
   game and play it, and should never need to know (or have an account on) the plumbing.
   Google reaches essentially everyone. Two-way steering doesn't need creator GitHub
   identities either: the app relays creator feedback as a bot-posted PR comment with
   attribution text ("creator @uid via gamedev.pl"). GitHub sign-in can still arrive later
   as a _second_ provider for power-creators — the session layer is provider-agnostic
   (uid = `g:<sub>` now, `gh:<id>` possible later) — but it's not on the critical path.
2. **One first milestone that pays for itself: gate the spend path.** v1's M1 shipped
   identity with no enforcement — a milestone that adds risk (new auth surface) and no value.
   v2's M1 ships sign-in **and** gates `POST /api/submissions` + preview + mock-generate with
   ownership + daily quota in one go. Everything else stays behind Basic-Auth, unchanged.
3. **Dropped the append-only usage events collection.** No consumer exists for it yet, and
   every play would cost a Firestore write. Daily counter docs are enough for quotas; the
   audit trail is structured request logs with `uid` (Cloud Logging → BigQuery sink later if
   dashboards are wanted). Reintroduce events only when something reads them.
4. **Fixed the blocked-user gap.** v1 rejected `tier: blocked` at login only — a blocked user
   with a 7-day cookie kept access for up to 7 days. v2 resolves the user doc from the store on
   every authenticated request rather than trusting the cookie's claims, so blocking takes
   effect on the next request whatever the session's remaining lifetime. That is what lets the
   session itself be long (30 days, sliding) without reopening the gap.
5. **Play/catalog gating is explicitly deferred as a product decision, not defaulted.**
   Games are cached and cost ~nothing to serve; the real spend is Copilot submissions. Gating
   play kills the growth loop (sharing a playable game link is the viral surface), but the
   owner may want a fully walled beta. Both are one `requireSession` line at M2 — decide
   then, with Basic-Auth still up in the meantime either way.

## Where we were when this was written (2026-07-23)

<!-- Kept as the starting point the plan reasoned from. Every "today" below refers to that
     date, not to now: auth, quotas, Firestore and the PRIVATE_BETA gate are all live. -->

- One Cloud Run service (`gamedev-app`) serves the React SPA + Fastify API same-origin.
- Access boundary today: site-wide HTTP Basic Auth (one shared credential — no identity).
- Submission "auth" today: unauthenticated `POST /api/submissions` mints an HMAC bearer
  token per issue; per-IP rate limiting only; all state in-memory; no attribution.
- **There is no database anywhere in the stack.** Usage accounting needs one.

## Decisions

| #   | Decision              | Choice                                                                                                                                                                                                                 | Why / alternatives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Identity provider     | **"Sign in with Google" (Google Identity Services) + server-side ID-token verification** (`google-auth-library`), minting our own session                                                                              | Maximum reach; GitHub is invisible plumbing, not a user-facing brand (see rethink #1). GitHub OAuth later as an optional second provider for power-creators. Auth0/Clerk rejected (cost, external dependency).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D2  | Session mechanism     | **HttpOnly + Secure + SameSite=Lax cookie, signed session JWT** (our `SESSION_SECRET`, HMAC — same discipline as `submission-token.ts`), **30d expiry, sliding renewal** (12h for a cookie traded for an access token) | Same-origin SPA ⇒ cookies; nothing in localStorage/URLs (existing invariant). CSRF: SameSite=Lax + `Origin` check + JSON content-type on mutations. Support two accepted secrets (`SESSION_SECRET`, `SESSION_SECRET_PREV`) so rotation doesn't log everyone out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2a | Session length        | **30 days for a person, 12 hours for a cookie traded for an access token**; renew once less than half the lifetime remains                                                                                             | Renewal is sliding but only fires on a request, so the expiry really sets how long someone may stay away and still come back signed in. At the original 12h that was almost everyone: the site is opened from a phone home screen once or twice a day, and any gap longer than a night expired the cookie between visits. iOS made it worse, because a standalone home-screen PWA keeps a cookie jar separate from Safari's, so each context aged out on its own and a creator who used both appeared to be logged out at random. Token-derived cookies stay short: they are minted unattended by agents and CLI runs, where nobody is inconvenienced by signing in again, and they carry a token's authority in cookie form. Length costs little here because every authenticated request re-reads the user doc (see rethink #4), so blocking and deletion still take effect at once. |
| D3  | Datastore             | **Firestore (Native mode)**                                                                                                                                                                                            | Serverless, scale-to-zero, IAM via runtime SA (no key file, nothing new in Secret Manager for DB). Cloud SQL rejected: always-on cost for a handful of tiny collections.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D4  | What gets gated first | **Spend path only at M1**: submit, preview, mock-generate. Catalog/play/status reads stay behind Basic-Auth until the M2 product decision                                                                              | Spend = Copilot budget + GitHub API writes. Reads are cached and cheap. See rethink #5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D5  | Existing status links | HMAC status tokens remain **read-only share links**; owner (by uid) additionally sees play/preview actions; token alone never becomes a login bypass for spend actions                                                 | Keeps "send your friend the progress link" inside the walled garden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Data model (Firestore)

```
users/{uid}            # uid = "g:<Google sub claim>" (provider-prefixed for future GitHub)
  email, name, picture       # display only; email never used as a key
  createdAt, lastLoginAt
  tier: 'standard' | 'trusted' | 'blocked'

submissions/{jobId}
  ownerUid, createdAt, title      # title sanitized, as sent to GitHub

usage/{uid}/counters/{yyyy-mm-dd}
  submissions: n, previews: n, mocks: n   # transactional increments; quota reads hit this doc only

globalUsage/{yyyy-mm-dd}
  submissions: n                          # everyone together, for the global cap below

opsConfig/creationLimits                  # the circuit-breaker; operator-written, no deploy
  paused: bool, globalDailySubmissionCap: n | null, updatedAt, updatedBy
```

No events collection (rethink #3). Google `sub` is stable for the life of the account.

## AuthZ matrix

| Route                                 | Today              | M1                          | M2+ (product decision)                |
| ------------------------------------- | ------------------ | --------------------------- | ------------------------------------- |
| `GET /api/health`                     | basic auth         | public                      | public                                |
| `GET /api/auth/*` (new)               | —                  | public                      | public                                |
| `POST /api/submissions`               | basic auth         | **session + quota + owner** | same                                  |
| `GET /api/submissions/:token/preview` | basic auth + token | **session + token**         | same                                  |
| `GET /api/submissions/:token`         | basic auth + token | unchanged                   | session + token                       |
| `GET /api/catalog`                    | basic auth         | unchanged                   | **public** (owner decided 2026-07-23) |
| `GET /api/games/:slug`                | basic auth         | unchanged                   | **public** (owner decided 2026-07-23) |

Rate limiting: per-uid daily counters for quotas; existing per-IP in-memory limiter stays as
the coarse outer layer (and is the only limiter on `/api/auth/*`).

## API changes

- `apps/api/src/platform/auth.ts` (new):
  - `POST /api/auth/google` — body: GIS ID token; verify signature/audience/issuer/expiry
    via `google-auth-library`; upsert `users/g:<sub>`; reject `tier: blocked`; set session
    cookie. No OAuth redirect dance, no client secret — ID-token verification only.
  - `POST /api/auth/logout`, `GET /api/auth/me` (SPA boot).
  - `requireSession` Fastify guard applied per-route. Basic-Auth hook stays outermost.
- `apps/api/src/platform/store.ts` (new) — thin Firestore wrapper with an **in-memory fake for tests**
  (same seam pattern as the `githubClient` stubs; unit tests never touch real Firestore).
- `submissions.ts` — owner recorded on create; transactional quota check before job
  creation (native-job allocation and direct agent dispatch, not a GitHub issue); preview
  requires session; counters incremented on spend.

## Web changes

- GIS script + "Sign in with Google" button (the shell has no CSP today; if one is added,
  allow the GIS origin). Auth context boots via `/api/auth/me`.
- All fetches stay same-origin cookie-authenticated; zero token handling in JS.
- i18n (en/pl): sign in/out, quota exceeded, blocked, "your submission" ownership labels.

## Infra / CI/CD changes

- **Secrets**: one new secret, `session-secret` (mint like `submission-token-secret`); wire
  into the existing single `--set-secrets` list in `deploy.yml` + `infra/deploy-api.sh`
  (remember the bash 3.2 empty-array fix pattern). `GOOGLE_OAUTH_CLIENT_ID` is public →
  plain env var. No client secret needed for the GIS ID-token flow.
- **IAM**: runtime SA gets `roles/datastore.user`; Firestore enable + database create added
  idempotently to `infra/setup-gcp.sh`.
- **OAuth consent screen + client id**: owner action in GCP console (external, published so
  any Google account can sign in; branding = name/logo/support email). Document in
  `docs/deployment.md`.
- **CI**: unit tests for session verification (forged/expired/wrong-secret), ID-token
  rejection paths (bad audience/issuer), the 401 route matrix, quota logic on the store
  fake. No live Google/Firestore calls in CI.
- **Deploy smoke test**: `/api/health` stays the 200 probe. At M1 add a negative check:
  `POST /api/submissions` without a session (but with basic auth) → 401 — proves the inner
  wall is up before traffic promotion. The current `/api/catalog` 200 check keeps working
  until M2/M3; flip it to its final expectation in the same PR that regates catalog.
- **Secret scanning**: nothing new in-repo; `.gitleaks.toml` already in place.

## Privacy (storing Google identities = PII)

- Minimal claims only (`sub`, email, name, picture); key on `sub`, never email.
- Short privacy note page: what we store, why, deletion contact. Deletion = admin script
  removing `users/{uid}` + counters + `ownerUid` scrub (GitHub issues only ever carry the
  sanitized, unverified display name).
- Logs carry `uid`, never emails.

## Rollout milestones (each independently shippable; Basic-Auth on until M3)

- **M1 — Sign-in + gated spend.** (CODE BUILT, awaiting GCP console setup & live verification) Google sign-in, sessions, Firestore provisioned, `users` +
  `submissions.ownerUid` + daily quota (default: 5 submissions/day, env-tunable; `trusted`
  tier bypasses), preview/mock gated.
- **M2 — Read-side decision + UX.** (IN PROGRESS — quota UX & public read decision implemented) Owner decided public catalog/play reads; quota-exceeded and blocked UX; status links stay shareable read-only.
- **M3 — Retire Basic-Auth.** (DONE in code — one owner action left) The hook is gone, no source reads `SITE_BASIC_AUTH`, the secret is mapped into none of the three Cloud Run services, and the smoke tests are session-only. Sign-in plus the `PRIVATE_BETA` allowlist is the single auth boundary. Remaining: delete the orphaned `site-basic-auth` secret in Secret Manager — see [`deployment.md`](./deployment.md).
- **M4 — Visibility + reach.** Admin usage view (allowlisted uids) / BigQuery log sink; optionally add GitHub as a second provider for power-creators.

## The global cap and pause switch (built 2026-07-30)

Per-user quotas bound what **one** creator costs. Nothing bounded what everyone costs
together, so total spend was bounded only by the invite count — which is not a control,
it is an accident of how many invitations have gone out. And there was no way to stop
creation at all short of editing an environment variable and redeploying, which
mid-incident also drops every party room in flight.

Two controls now sit beside the per-user quota, both in
[`creation-limits.ts`](../apps/api/src/creation/creation-limits.ts):

| Control                    | Effect                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `paused`                   | `POST /api/submissions` refuses with `creation_paused`                                |
| `globalDailySubmissionCap` | at most N submissions per UTC day across every account, then `creation_over_capacity` |

Both live in the `opsConfig/creationLimits` document rather than in the environment,
**because a breaker is only worth having if pulling it is cheaper than the incident.**
Readers cache for 60s, so a change reaches every instance within about a minute and costs
one document read per instance per minute in between. `GLOBAL_DAILY_SUBMISSION_CAP` sets
the fallback ceiling that applies when the document sets none — a real number (default 50),
never infinity, so an unwritten or unreadable document still has a ceiling.

Operating it (admin session required; `ADMIN_UIDS`):

```bash
curl -s -b cookies.txt https://www.gamedev.pl/api/admin/creation-limits          # what is in force + today's spend
curl -s -b cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"paused":true}' https://www.gamedev.pl/api/admin/creation-limits          # stop creation
  # …and '{"paused":false}' to resume, '{"globalDailySubmissionCap":25}' to retune.
```

Three deliberate choices worth knowing:

- **Refusals cost the creator nothing.** The gate runs after moderation but before the
  per-user quota is spent and before any GitHub write, so a creator turned away by a
  site-wide limit still has their whole daily allowance — which is what the message they
  see says, in both languages.
- **`bot:` accounts bypass it entirely** — not paused, not capped, not counted. Pausing
  creation is an incident response, and the deploy pipeline's own smoke checks run as
  `bot:` accounts; a tripped cap that reddened the deploy gate would remove the ability to
  ship a fix at exactly the wrong moment. They remain standard-tier for the _per-user_
  quota, and the namespace cannot be self-assigned (see `docs/agent-access-tokens.md`).
- **`trusted` accounts do not bypass it.** They skip the per-user quota, which makes them
  precisely the accounts a global spend ceiling exists to bound.

## Adjacent safeguards (unchanged from v1, still required)

1. **Dependabot backlog** (16 alerts, 4 critical) — triage before M1; authn on vulnerable
   deps is theater. Likely dev-tooling chains; verify.
2. **Alerting**: 5xx rate + catalog-fetch failure (runtime GitHub API dependency).
3. **Invariants** (goes in `docs/security-model.md`): game iframes stay
   `sandbox="allow-scripts allow-pointer-lock"` with **no** `allow-same-origin` — _more_ critical once session
   cookies exist on the app origin; no secret reaches the browser; no tokens in URLs or
   localStorage; creator text is data, never instructions.
4. **Login abuse**: per-IP limit on `/api/auth/*`; audience + issuer pinned; small
   clock-skew tolerance on ID-token verification.

## Open questions for the owner

1. ~~**M2 read-side**~~ **DECIDED 2026-07-23: public reads.** Catalog + playing published
   games stay open (behind Basic-Auth until M3, fully public after). The growth loop —
   sharing a playable game link — is preserved. Only spend paths (submit/preview/generate)
   require sign-in.
2. **Quota numbers**: 5 submissions/day/user to start? Who besides you gets `trusted`?
3. **Consent screen branding**: app name, logo, support email (owner supplies in GCP console).

---

## Sign in with Apple (built and **live** 2026-07-28)

Added ahead of the mobile plan's M2 store apps, where it stops being optional: App Store
guideline 4.8 requires it beside Google in any app offering a third-party login. It is
offered on the **web** too rather than app-only, which is
[`mobile-app-plan.md`](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/mobile-app-plan.md) open question 2's working answer turned into
code — otherwise a creator who signs up through the iOS app cannot reach their own games
from a desktop browser.

**It is on.** Services ID `pl.gamedev.web` was created 2026-07-28 and both variables are
set, so `/api/health` reports `appleSignIn: true` and the button paints. Verified end to
end in production the same day, including the part that mattered: signing in with Apple
landed the owner in their **existing** Google-created account with their games, rather
than a fresh one — account linking working against real Apple tokens, not just tests.

**Domain verification turned out not to be part of this flow.** The console never offered
an association file, and none was needed: Apple validates the web flow against the
registered **Return URLs**. `apple-developer-domain-association.txt` belongs to the
private-email relay service, which this product deliberately does not use.

### What the owner has to do (none of it can be done from the repo)

1. Join the **Apple Developer Program** (~$99/yr). Everything below needs it, including
   the web-only flow — there is no free tier for Sign in with Apple.
2. Create an **App ID** and enable the _Sign in with Apple_ capability on it.
3. Create a **Services ID** (e.g. `pl.gamedev.web`) — this is the _web_ client, distinct
   from the app's bundle ID — and enable _Sign in with Apple_ on it.
4. Under that Services ID, configure:
   - **Domain**: `www.gamedev.pl`, then complete Apple's domain-verification file check.
   - **Return URL**: `https://www.gamedev.pl/` — must be https and must match exactly.
     Apple rejects every `http://` origin, which is why this flow **cannot be exercised
     from localhost or from a preview build**; a deployed https origin is the only place
     it can be tested at all.
5. Set two repo-level Actions **variables** (not secrets — both values are public):
   - `APPLE_SERVICES_ID` — the Services ID from step 3. Baked into the web bundle at
     build time; empty means the button stays hidden.
   - `APPLE_CLIENT_IDS` — comma-separated audiences the API will accept. Today that is
     just the Services ID; when the M2 iOS app exists, add its bundle ID here rather than
     standing up a second verifier.

`infra/deploy-api.sh` reads the same two names from the environment for a manual deploy.

### Design notes worth keeping

- **Account linking is the point, not a bonus.** Every beta creator's games hang off a
  `g:<sub>` uid. An Apple button that minted a fresh `a:<sub>` would drop the first person
  who tapped it into an empty account, with their work apparently gone and no
  self-service way back. So `resolveAppleAccount` signs them into the existing account
  when the Apple token carries a **verified, non-relay** address matching exactly one
  user. An ambiguous match creates a new account instead of guessing — signing somebody
  into the wrong account is unrecoverable, handing them a spare one is not.
- **Hide My Email is a known, accepted limitation.** A creator who picks it gets a
  per-app `@privaterelay.appleid.com` address that no allowlist and no existing account
  can match, so they land in a new account and, under private beta, are refused and sent
  to the waitlist. Correct, but it will read as a bug when it first happens — the fix is
  an explicit "link an Apple ID" action on an already-signed-in account, not looser
  matching.
- **`email_verified` arrives as a boolean _or_ the string `"true"`**, depending on the
  flow. `Boolean("false")` is `true`, so a direct read of that claim fails **open** on the
  one flag gating the allowlist. `appleClaimFlag` exists solely for this and is pinned by
  a test.
- **The audience is a set and the algorithm is pinned.** One verifier serves both the web
  Services ID and the future bundle ID; `algorithms: ['RS256']` is what refuses the
  classic JWT algorithm-confusion forgery.
- **Apple sends the display name exactly once**, in the body of the first authorization
  and never in the token. The web client forwards it on that one request; a later sign-in
  carries none and must not blank the stored one.

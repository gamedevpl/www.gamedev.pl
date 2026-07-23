# Auth & per-user usage: plan (v2 — rethought)

> Status: **M1, M2, M3 built and verified** (2026-07-23). Goal: no anonymous
> interaction with the system; every submission attributable to a signed-in user; per-user
> usage accounting and quotas. Basic-Auth retired; Google sign-in is the single boundary.

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
   with a 7-day cookie kept access for up to 7 days. v2: sessions are 12h sliding, and every
   _spend_ route re-reads the user doc anyway (quota check), so blocking takes effect on the
   next spend attempt immediately and on reads within 12h.
5. **Play/catalog gating is explicitly deferred as a product decision, not defaulted.**
   Games are cached and cost ~nothing to serve; the real spend is Copilot submissions. Gating
   play kills the growth loop (sharing a playable game link is the viral surface), but the
   owner may want a fully walled beta. Both are one `requireSession` line at M2 — decide
   then, with Basic-Auth still up in the meantime either way.

## Where we are

- One Cloud Run service (`gamedev-app`) serves the React SPA + Fastify API same-origin.
- Access boundary today: site-wide HTTP Basic Auth (one shared credential — no identity).
- Submission "auth" today: unauthenticated `POST /api/submissions` mints an HMAC bearer
  token per issue; per-IP rate limiting only; all state in-memory; no attribution.
- **There is no database anywhere in the stack.** Usage accounting needs one.

## Decisions

| #   | Decision              | Choice                                                                                                                                                                   | Why / alternatives                                                                                                                                                                                                                                               |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Identity provider     | **"Sign in with Google" (Google Identity Services) + server-side ID-token verification** (`google-auth-library`), minting our own session                                | Maximum reach; GitHub is invisible plumbing, not a user-facing brand (see rethink #1). GitHub OAuth later as an optional second provider for power-creators. Auth0/Clerk rejected (cost, external dependency).                                                   |
| D2  | Session mechanism     | **HttpOnly + Secure + SameSite=Lax cookie, signed session JWT** (our `SESSION_SECRET`, HMAC — same discipline as `submission-token.ts`), **12h expiry, sliding renewal** | Same-origin SPA ⇒ cookies; nothing in localStorage/URLs (existing invariant). CSRF: SameSite=Lax + `Origin` check + JSON content-type on mutations. Support two accepted secrets (`SESSION_SECRET`, `SESSION_SECRET_PREV`) so rotation doesn't log everyone out. |
| D3  | Datastore             | **Firestore (Native mode)**                                                                                                                                              | Serverless, scale-to-zero, IAM via runtime SA (no key file, nothing new in Secret Manager for DB). Cloud SQL rejected: always-on cost for a handful of tiny collections.                                                                                         |
| D4  | What gets gated first | **Spend path only at M1**: submit, preview, mock-generate. Catalog/play/status reads stay behind Basic-Auth until the M2 product decision                                | Spend = Copilot budget + GitHub API writes. Reads are cached and cheap. See rethink #5.                                                                                                                                                                          |
| D5  | Existing status links | HMAC status tokens remain **read-only share links**; owner (by uid) additionally sees play/preview actions; token alone never becomes a login bypass for spend actions   | Keeps "send your friend the progress link" inside the walled garden.                                                                                                                                                                                             |

## Data model (Firestore)

```
users/{uid}            # uid = "g:<Google sub claim>" (provider-prefixed for future GitHub)
  email, name, picture       # display only; email never used as a key
  createdAt, lastLoginAt
  tier: 'standard' | 'trusted' | 'blocked'

submissions/{issueNumber}
  ownerUid, createdAt, title      # title sanitized, as sent to GitHub

usage/{uid}/counters/{yyyy-mm-dd}
  submissions: n, previews: n, mocks: n   # transactional increments; quota reads hit this doc only
```

No events collection (rethink #3). Google `sub` is stable for the life of the account.

## AuthZ matrix

| Route                                 | Today              | M1                               | M2+ (product decision)                |
| ------------------------------------- | ------------------ | -------------------------------- | ------------------------------------- |
| `GET /api/health`                     | basic auth         | public                           | public                                |
| `GET /api/auth/*` (new)               | —                  | public                           | public                                |
| `POST /api/submissions`               | basic auth         | **session + quota + owner**      | same                                  |
| `GET /api/submissions/:token/preview` | basic auth + token | **session + token**              | same                                  |
| `POST /api/generate-game`             | basic auth         | **session + quota (cheap tier)** | same                                  |
| `GET /api/submissions/:token`         | basic auth + token | unchanged                        | session + token                       |
| `GET /api/catalog`                    | basic auth         | unchanged                        | **public** (owner decided 2026-07-23) |
| `GET /api/games/:slug`                | basic auth         | unchanged                        | **public** (owner decided 2026-07-23) |

Rate limiting: per-uid daily counters for quotas; existing per-IP in-memory limiter stays as
the coarse outer layer (and is the only limiter on `/api/auth/*`).

## API changes

- `apps/api/src/auth.ts` (new):
  - `POST /api/auth/google` — body: GIS ID token; verify signature/audience/issuer/expiry
    via `google-auth-library`; upsert `users/g:<sub>`; reject `tier: blocked`; set session
    cookie. No OAuth redirect dance, no client secret — ID-token verification only.
  - `POST /api/auth/logout`, `GET /api/auth/me` (SPA boot).
  - `requireSession` Fastify guard applied per-route. Basic-Auth hook stays outermost.
- `apps/api/src/store.ts` (new) — thin Firestore wrapper with an **in-memory fake for tests**
  (same seam pattern as the `githubClient` stubs; unit tests never touch real Firestore).
- `submissions.ts` — owner recorded on create; transactional quota check before
  `createIssue`; preview requires session; counters incremented on spend.

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

- **M1 — Sign-in + gated spend.** (COMPLETE) Google sign-in, sessions, Firestore provisioned, `users` +
  `submissions.ownerUid` + daily quota (default: 5 submissions/day, env-tunable; `trusted`
  tier bypasses), preview/mock gated.
- **M2 — Read-side decision + UX.** (COMPLETE) Owner decided public catalog/play reads; quota-exceeded and blocked UX; status links stay shareable read-only.
- **M3 — Retire Basic-Auth.** (COMPLETE) Deleted `site-basic-auth` + hook; smoke tests updated. Google sign-in is the single auth boundary.
- **M4 — Visibility + reach.** Admin usage view (allowlisted uids) / BigQuery log sink; optionally add GitHub as a second provider for power-creators.

## Adjacent safeguards (unchanged from v1, still required)

1. **Dependabot backlog** (16 alerts, 4 critical) — triage before M1; authn on vulnerable
   deps is theater. Likely dev-tooling chains; verify.
2. **Alerting**: 5xx rate + catalog-fetch failure (runtime GitHub API dependency).
3. **Invariants** (goes in `docs/security-model.md`): game iframes stay
   `sandbox="allow-scripts"` with **no** `allow-same-origin` — _more_ critical once session
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

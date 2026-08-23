# Closed-beta splash + sign-in waitlist

> Status: ✅ **Shipped** (verified 2026-07-26). An anonymous visitor to www.gamedev.pl gets
> the splash and can join the waitlist; the beta wall gates `/api/` paths while the static
> shell still loads, except for operator-selected promotional games. See
> [`apps/web/src/ClosedBetaSplash.tsx`](../apps/web/src/ClosedBetaSplash.tsx)
> and the waitlist routes in [`apps/api/src/platform/auth.ts`](../apps/api/src/platform/auth.ts).
>
> Originally planned 2026-07-23 (owner approved), depending on the P0 shell fix.

## Splash (the signed-out state)

When the shell loads and the visitor has no session (`/api/auth/me` → 401),
render a branded closed-beta landing instead of the app UI:

- Site identity: dark `#1d2123` card on `#454545` body, turquoise `#00e4ac`
  accent, gamedev.pl wordmark (`.pl` in turquoise), Proxima Nova.
- Copy (i18n en/pl): what this is ("create games with AI, play what others
  made") + "closed beta — access is invite-only for now".
- Primary action: **Join the waitlist** (visible before sign-in; still requires
  Google/Apple login to complete) plus **Sign in with Google** / Apple.
- No data fetches beyond `/api/auth/me` — the catalog is walled anyway;
  don't fire requests that will 401 and log noise.

## Splash minigame

The signed-out splash (not the invite page) includes a lightweight snack-catch
secret: poke the mascot five times to unlock it. Pointer/touch slides him; snacks
fall; three misses end the round. It is CSS/React in the shell — not GameKit, not
an iframe.

- Waitlist and sign-in stay the only visible actions. The mascot's existing poke
  reactions are the discoverability cue; no second CTA competes with the waitlist.
- Short screens (`max-height: 720px`) hide the headline, badge, and footer
  while a round is in progress so the legal links and Join CTA still fit.
- `prefers-reduced-motion` keeps the game, slows the fall, and drops snack
  wobble / catch squash.
- No extra `/api` calls. Score lives in component state for the tab only.

## Waitlist — sign-in based, consent-explicit

Mechanic: the splash always shows **Join the waitlist** above the sign-in buttons.
Clicking it without an ID token asks the visitor to sign in (Google or Apple); joining
still requires a verified token. After a rejected allowlist sign-in with join intent,
the splash auto-joins so the visitor is not asked to press Join twice. A rejected
sign-in without prior intent still leaves the CTA visible and keeps the token for an
explicit click.

- Clicking join (with a token) calls **`POST /api/waitlist`** with the same Google/Apple
  ID token (re-verified server-side — never trust the client's claim of who they are).
  The endpoint:
  - verifies the token (same verifier, same audience pinning);
  - upserts `waitlist/{uid}`: `{ uid, email, name, requestedAt, locale }`
    (idempotent — joining twice updates `requestedAt` at most);
  - is rate-limited by the existing per-IP auth limiter;
  - works WITHOUT a session (the caller is by definition not allowed in).
- Privacy invariants:
  - A rejected sign-in alone still leaves no Firestore trace; only the
    explicit join click (or auto-join after an explicit Join → sign-in) writes data
    (that click is the consent moment).
  - Deletion = delete one doc. No marketing use implied; the doc exists so
    the owner can invite people.
  - `email_verified` must be true on the token to store the email (same
    rule as the beta email allowlist).
- UI after joining: "You're on the list" confirmation; joining again is a
  no-op visually ("already on the list").
- **Telemetry:** `waitlist_step` on the visit stream (`cta_clicked` → `joined`),
  aggregated in `summarizeVisitFunnel` and rendered as a Waitlist block on the
  operator telemetry panel beside Creating.
- **Operator notify:** each new applicant fans out `operator.waitlist_joined` to
  every `ADMIN_UIDS` account (in-app bell + email + push, same posture as queue
  alerts — no unsubscribe). Idempotent per uid. Deep link: `/admin/waitlist`.

## Store

`Store` interface gains `upsertWaitlistEntry(entry)` (+ `InMemoryStore` and
`FirestoreStore` implementations; Firestore collection `waitlist`, doc id =
uid). Operator reads/writes go through `listWaitlistEntries` /
`setWaitlistStatus` / `setWaitlistStatusByEmail` and the `/api/admin/waitlist`
routes behind the console tab.

## Promotion flow

Primary: operator console **`/admin/waitlist`** — approve / reject / pre-approve
by email (Firestore `status: 'approved'`, no redeploy). Fallback: `npm run
beta:approve` or the env allowlists (`BETA_ALLOWED_EMAILS` /
`BETA_ALLOWED_UIDS`) when a script or agent needs to act without a browser.

Promotional play links are managed separately in **`/admin/limits`**. The operator enters
published slugs in the **Promotional game links** panel; those `/play/<slug>` routes and
their anonymous play telemetry bypass the beta wall without opening the catalog.

## Tests

- 403 from `/api/auth/google` for non-allowlisted user still writes nothing
  (exists — keep).
- `POST /api/waitlist` with valid token → doc in store with expected fields;
  repeat call idempotent.
- Invalid/forged token → 401, nothing written.
- Unverified email on token → entry stored WITHOUT email (or rejected —
  either is fine, but never store an unverified email).
- Web: signed-out state renders splash with Join waitlist above sign-in; Join without
  a token prompts sign-in and does not POST; Join → rejected sign-in auto-joins;
  rejected sign-in without prior Join still shows the CTA; joined state renders
  confirmation; `waitlist_step` events reach the visit funnel panel.

## Smoke (deploy.yml)

- Anonymous `GET /` → 200 (from the P0 fix — the splash must be reachable).
- `POST /api/waitlist` with no body → 400 (proves the route exists and
  validates; no auth header needed for the probe).

## One-time invite links

Operators can create a one-time invitation from **`/admin/waitlist`**. The panel returns the
link once, with a copy button, and keeps only its status afterward:

- The link contains a high-entropy bearer code.
- The first account to accept it through Google or Apple gets beta access.
- The code is hashed in Firestore and claimed in a transaction, so concurrent clicks cannot
  spend it twice.
- The invitation is bound to the account used during sign-in, not to an email address.
- Accepting writes that account's approved `waitlist` row, so the claimant shows up in
  `/admin/waitlist` and keeps access after the session that claimed the link expires.
- Operators can revoke an unused link and create another if it is lost or shared too widely.
- The invitation page explains that the first account to accept owns the link; forwarding is
  therefore intentional access delegation, not proof of a particular person's identity.

The link route records only invite funnel steps (`opened`, `accepted`, `unavailable`) in the
anonymous visit stream. It never records the code or the signed-in account there.

Email-form waitlist remains out of scope: it would accept unverified identity data and create
a separate moderation surface.

## First-login welcome

The first successful sign-in for a new account returns a one-time welcome state. The
signed-in shell shows a short, dismissible orientation card:

- play a few games first;
- describe an idea to build a game;
- report rough edges and surprises.

The welcome is shown from the client-side sign-in response, not inferred from a browser
cookie. That keeps it tied to the account's first successful authentication while avoiding
another persistent personal-data field. Anonymous visit telemetry records `shown`,
`continued`, or `dismissed` without a uid.

## Existing operator surface

- Admin UI for the waitlist shipped as the operator console **Waitlist** tab
  (`/admin/waitlist`) — list, approve/reject/reset, pre-approve by email.

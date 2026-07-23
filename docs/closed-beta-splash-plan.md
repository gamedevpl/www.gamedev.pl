# Closed-beta splash + sign-in waitlist

> Status: plan (2026-07-23, owner approved). Depends on the P0 shell fix
> (beta wall gates only `/api/` paths — the static shell must load for
> anonymous visitors). Splash = part of that fix's UX completion; waitlist =
> small increment slotted after the dependency security bumps, before the
> content-safety slices.

## Splash (the signed-out state)

When the shell loads and the visitor has no session (`/api/auth/me` → 401),
render a branded closed-beta landing instead of the app UI:

- Site identity: dark `#1d2123` card on `#454545` body, turquoise `#00e4ac`
  accent, gamedev.pl wordmark (`.pl` in turquoise), Proxima Nova.
- Copy (i18n en/pl): what this is ("create games with AI, play what others
  made") + "closed beta — access is invite-only for now".
- Primary action: **Sign in with Google** (existing GIS button).
- No data fetches beyond `/api/auth/me` — the catalog is walled anyway;
  don't fire requests that will 401 and log noise.

## Waitlist — sign-in based, consent-explicit

Mechanic: non-allowlisted user signs in with Google → `/api/auth/google`
returns 403 (existing behavior, still writes NOTHING) → UI shows
"The beta is closed — want to join the waitlist?" with a join button.

- Clicking join calls **`POST /api/waitlist`** with the same Google ID token
  (re-verified server-side — never trust the client's claim of who they are).
  The endpoint:
  - verifies the token (same `GoogleAuthVerifier`, same audience pinning);
  - upserts `waitlist/{uid}`: `{ uid, email, name, requestedAt, locale }`
    (idempotent — joining twice updates `requestedAt` at most);
  - is rate-limited by the existing per-IP auth limiter;
  - works WITHOUT a session (the caller is by definition not allowed in).
- Privacy invariants:
  - A rejected sign-in alone still leaves no Firestore trace; only the
    explicit join click writes data (that click is the consent moment).
  - Deletion = delete one doc. No marketing use implied; the doc exists so
    the owner can invite people.
  - `email_verified` must be true on the token to store the email (same
    rule as the beta email allowlist).
- UI after joining: "You're on the list" confirmation; joining again is a
  no-op visually ("already on the list").

## Store

`Store` interface gains `upsertWaitlistEntry(entry)` (+ `InMemoryStore` and
`FirestoreStore` implementations; Firestore collection `waitlist`, doc id =
uid). No reads needed in-app for v1 — the owner reads the collection in the
Firestore console.

## Promotion flow (v1 = deliberately manual)

Owner reads `waitlist` collection → adds chosen uid to `BETA_ALLOWED_UIDS`
repo variable → redeploys (or asks Claude to). At beta scale this is fine.
v2 (only if the list grows): store-backed allowlist — `waitlist/{uid}.status
= 'approved'` consulted by the auth check, no redeploy per invite.

## Tests

- 403 from `/api/auth/google` for non-allowlisted user still writes nothing
  (exists — keep).
- `POST /api/waitlist` with valid token → doc in store with expected fields;
  repeat call idempotent.
- Invalid/forged token → 401, nothing written.
- Unverified email on token → entry stored WITHOUT email (or rejected —
  either is fine, but never store an unverified email).
- Web: signed-out state renders splash; 403 sign-in shows waitlist CTA;
  joined state renders confirmation.

## Smoke (deploy.yml)

- Anonymous `GET /` → 200 (from the P0 fix — the splash must be reachable).
- `POST /api/waitlist` with no body → 400 (proves the route exists and
  validates; no auth header needed for the probe).

## Explicitly not in v1

- Email-form waitlist (unverified input, bots, moderation surface — no).
- Admin UI for the waitlist; invite emails; counts on the splash page.

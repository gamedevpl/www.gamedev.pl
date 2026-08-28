---
name: managing-beta-participants
description: How to manage closed beta participants, approve waitlisted users, add pre-approved entries, inspect waitlist status, and manage access lists in Firestore or environment variables. Use whenever you need to grant, check, or revoke closed beta access for users on www.gamedev.pl.
---

# Managing Closed Beta Participants

Guidance for agents and admins managing closed beta access on **www.gamedev.pl**.

## Architecture & Access Control

When `PRIVATE_BETA=true`, all `/api/*` data routes and sign-in require an approved account.
Access is determined by a **dual-layer check** inside [`apps/api/src/platform/auth.ts`](../../apps/api/src/platform/auth.ts):

1. **Dynamic Firestore Approval (Primary)**:
   Checks Firestore `waitlist` collection (`projectId: gamedevpl`) via `isWaitlistApproved(uid, email)`.
   - Document `waitlist/{uid}` with `status: 'approved'`.
   - Query `waitlist` where `email == emailLower` AND `status == 'approved'`.
   - **Instant**: Does **not** require redeploying Cloud Run.

2. **Environment Variable Allowlist (Bootstrap / Admin Fallback)**:
   - `BETA_ALLOWED_EMAILS`: Comma-separated list of Google-verified emails.
   - `BETA_ALLOWED_UIDS`: Comma-separated list of Google UIDs (`g:<sub>`).
   - Configured via GitHub Repository Variables (`vars.BETA_ALLOWED_EMAILS`, `vars.BETA_ALLOWED_UIDS`) and passed during Cloud Run deployments ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) or [`infra/deploy-api.sh`](../../infra/deploy-api.sh)).

> ⚠️ **Security Invariant**: Email access checks require `email_verified === true` in the Google ID token. An unverified email claim will never grant beta access.

### A third path: automation accounts

Neither layer above applies to **coding agents and other programmatic callers**. They hold a
personal access token issued to a `bot:` account
([`docs/agent-access-tokens.md`](../../docs/agent-access-tokens.md)) and reach authenticated
routes with `Authorization: Bearer <token>` — passing the private-beta wall without appearing
on any allowlist.

That is intended, not a gap. The allowlists gate **sign-in**; an admin minting a token is
itself an admission decision, made deliberately and revocably. Two consequences worth
remembering when auditing access:

- **A waitlist/allowlist audit is not a complete picture of who can reach the API.** Also run
  `npm run token:list -w @gamedevpl/api -- <uid>` for any `bot:` account you know of.
- **Revoking beta access does not revoke a token**, and vice versa — they are independent.
  To fully cut off an automation account, revoke its tokens by id; removing it from an
  allowlist it was never on does nothing.

Do **not** add `bot:` uids to `BETA_ALLOWED_UIDS`. It would be a no-op that implies these
accounts sign in, which they cannot.

---

## Approving or Managing Participants

### 1. Using the Operator Console (Recommended)

Signed-in operators (`ADMIN_UIDS`) open **`/admin/waitlist`** — a tab on the
operator console. From there you can:

- list applicants (filter pending / approved / rejected / all);
- approve, reject, or reset an existing row;
- pre-approve by email before the person has visited (creates
  `waitlist/email:<lower>` the same way the CLI does);
- create a one-time invite link for someone whose email you do not know. Accepting it
  writes the claimant's approved `waitlist/g:<sub>` row, so they appear in this list like
  any other member and keep access after that first session
  ([`docs/deployment.md`](../../docs/deployment.md) → "Sending a one-time invite link").
  Claims made before that write existed leave no row — `npm run beta:invite:backfill`
  reconciles them.

Join notifications deep-link here. The same writes go through
`GET|POST /api/admin/waitlist` (session-only admin, 404 to everyone else).

### 2. Using the NPM Command (scripts / agents)

Approve access dynamically in Firestore using the helper script in `apps/api`
when you are not at a browser:

```bash
# From repository root
npm run beta:approve -w @gamedevpl/api -- user@example.com

# Or from apps/api directory
npm run beta:approve -- user@example.com
```

### How User IDs (UIDs) Work & Why You Don't Need Them

You **do not need to know a user's Google UID** to approve them.

1. **Google UID Format**:
   - When a user logs in with Google, Fastify generates `uid = 'g:' + googleUser.sub` (where `sub` is Google's 21-digit internal account ID, e.g., `g:103948201948291048201`).

2. **If the user already tried signing in or joined the waitlist**:
   - The app automatically creates a document `waitlist/g:<sub>` containing their email address (`email: 'user@example.com'`).
   - `npm run beta:approve -- user@example.com` queries Firestore by email, finds `waitlist/g:<sub>`, and updates `status: 'approved'`.

3. **If approving someone BEFORE they ever visit the site (Pre-approval)**:
   - `npm run beta:approve -- user@example.com` creates a document `waitlist/email:user@example.com` with `email: 'user@example.com'` and `status: 'approved'`.
   - When the user eventually signs in with Google, Google provides their verified email (`user@example.com`).
   - `store.isWaitlistApproved(uid, email)` queries Firestore for `where('email', '==', 'user@example.com')` and finds the approved document matching their email, granting instant access without ever needing their numeric Google `sub` ID.

#### Other Status Options:

```bash
# Reject a user
npm run beta:approve -- user@example.com --reject

# Reset status back to pending
npm run beta:approve -- user@example.com --pending
```

### 3. Waitlist welcome mail (`beta:welcome`)

When a spot opens, mail the people already on the waitlist. This is the email the splash
promised ("we'll email you when a spot opens up"), not a marketing broadcast. **Dry-run is
the default — nothing is sent until you pass `--send`.**

```bash
# Preview (no send, no Firestore writes)
npm run beta:welcome -w @gamedevpl/api
npm run beta:welcome -w @gamedevpl/api -- --only you@example.com
npm run beta:welcome -w @gamedevpl/api -- --status all --limit 5

# Let pending people in: approve + send. Requires RESEND_API_KEY.
export RESEND_API_KEY='re_...'
npm run beta:welcome -w @gamedevpl/api -- --approve --send --only you@example.com
```

Language is chosen from the waitlist `locale` (the UI language they joined in). If that
field is missing, a `.pl` email domain becomes Polish; everything else is English. First
name comes from the Google/Apple display name when it looks like a name. `--locale pl|en`
overrides both.

From stays on the already-verified sender `Grzegorz <noreply@mail.gamedev.pl>` so Resend
needs no new domain. Reply-To is `grzegorz@gamedev.pl`, so a reply reaches the owner once
the Workspace alias exists. Override From with `--from` or `BETA_WELCOME_FROM` if needed.
Same ADC/Firestore setup as `beta:approve`.

`--send` to pending people requires `--approve`, otherwise they would get "you're in" and
still hit the wall. Approve is written and verified **before** the send; `welcomeEmailedAt`
is stamped only after Resend accepts, so a delivery failure leaves access open instead of
a false promise. Unstamped approved rows stay in the default pending filter, so a retry
after a crash still finds them (`--force` to resend a stamped row). Rejected rows, `bot:`
accounts, and entries without an email are skipped.

---

## Environment Variable Allowlists (Redeploy-based Fallback)

If modifying the GitHub repository variable `BETA_ALLOWED_EMAILS` directly (e.g. via GitHub Web UI or `gh variable set`):

```bash
gh variable set BETA_ALLOWED_EMAILS --repo gamedevpl/www.gamedev.pl --body "user1@example.com,user2@example.com"
```

Updating repo variables takes effect on the next Cloud Run deployment triggered via `deploy.yml`.

### Reviewers (`REVIEWER_UIDS`) — not the waitlist

Granting `/review` desk access is a separate allowlist from closed beta. It is **not**
`beta:approve` and not a Firestore write — set the GitHub repository variable
`REVIEWER_UIDS` (comma-separated `g:<sub>` uids) and redeploy. Admins are reviewers
automatically. Full steps:
[`docs/game-assessment-plan.md`](../../docs/game-assessment-plan.md) → "Managing reviewers".

---

## Inspection & Debugging

- **Check if a user can sign in**:
  Run a query on Firestore `waitlist` collection for `email == user@example.com` or `uid == g:<sub>`.
- **Public endpoints**:
  `/api/health`, `/api/auth/*`, and `/api/waitlist` remain public even in `PRIVATE_BETA=true` mode, allowing unapproved users to join the waitlist.

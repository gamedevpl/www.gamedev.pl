---
name: managing-beta-participants
description: How to manage closed beta participants, approve waitlisted users, add pre-approved entries, inspect waitlist status, and manage access lists in Firestore or environment variables. Use whenever you need to grant, check, or revoke closed beta access for users on www.gamedev.pl.
---

# Managing Closed Beta Participants

Guidance for agents and admins managing closed beta access on **www.gamedev.pl**.

## Architecture & Access Control

When `PRIVATE_BETA=true`, all `/api/*` data routes and sign-in require an approved account.
Access is determined by a **dual-layer check** inside [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts):

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

---

## Approving or Managing Participants

### 1. Using the NPM Command (Recommended)

Approve access dynamically in Firestore using the helper script in `apps/api`:

```bash
# From repository root
npm run beta:approve -w @gamedevpl/api -- user@example.com

# Or from apps/api directory
npm run beta:approve -- user@example.com
```

#### How `beta:approve` Works:

- **User already on waitlist**: Updates their existing `waitlist` document status to `"approved"`.
- **User has NOT signed in / joined waitlist yet (Pre-approval)**:
  Automatically creates a document `waitlist/email:user@example.com` with `status: 'approved'`.
  When `user@example.com` signs in with Google for the first time, `isWaitlistApproved` matches their verified email and allows immediate login.
- **Approving by Google UID**:
  ```bash
  npm run beta:approve -- g:12345678901234567890
  ```

#### Other Status Options:

```bash
# Reject a user
npm run beta:approve -- user@example.com --reject

# Reset status back to pending
npm run beta:approve -- user@example.com --pending
```

---

## Environment Variable Allowlists (Redeploy-based Fallback)

If modifying the GitHub repository variable `BETA_ALLOWED_EMAILS` directly (e.g. via GitHub Web UI or `gh variable set`):

```bash
gh variable set BETA_ALLOWED_EMAILS --repo gamedevpl/www.gamedev.pl --body "user1@example.com,user2@example.com"
```

Updating repo variables takes effect on the next Cloud Run deployment triggered via `deploy.yml`.

---

## Inspection & Debugging

- **Check if a user can sign in**:
  Run a query on Firestore `waitlist` collection for `email == user@example.com` or `uid == g:<sub>`.
- **Public endpoints**:
  `/api/health`, `/api/auth/*`, and `/api/waitlist` remain public even in `PRIVATE_BETA=true` mode, allowing unapproved users to join the waitlist.

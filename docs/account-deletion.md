# Account deletion

Self-service account deletion is deliberately delayed. Confirming deletion writes
`deletionRequestedAt` and `deletionScheduledFor` to the user document, clears the current
session, and leaves all account data intact for 14 days. Existing sessions and personal
access tokens stop authenticating while the marker is present. A successful Google, Apple,
or local-development sign-in clears both fields and restores access.

Operator accounts are protected twice: the request endpoint rejects any uid currently in
`ADMIN_UIDS`, and the cleanup sweep skips a uid that became an operator after scheduling.
Remove the uid from `ADMIN_UIDS` and deploy that configuration before deletion can proceed.

After the deadline, `POST /api/internal/account-deletion-sweep` runs the existing idempotent
erasure path. Published games remain under the non-personal platform owner; unpublished
work is abandoned and unlinked; identity, credentials, subscriptions, player contributions,
saves, private drafts, and pre-game CLI chat history are erased.

## Scheduler setup

The sweep has its own OIDC audience so a token minted for another internal job cannot be
replayed against it. It shares the existing `notify-sweep` service account.

The normal GCP bootstrap provisions this automatically:

```bash
./infra/setup-gcp.sh
```

For a focused reconciliation, without running the rest of the project bootstrap:

```bash
./infra/setup-account-deletion.sh
```

Both paths are idempotent: they create or update the `account-deletion-sweep` job and ensure
its OIDC service account exists. The CI and manual deployment paths derive
`ACCOUNT_DELETION_SWEEP_AUDIENCE` and `NOTIFY_SWEEP_SA` from the project automatically, so
no GitHub Actions variable is required. Until a configured deployment reaches production,
the endpoint remains closed and the scheduled job fails safely without deleting anything.

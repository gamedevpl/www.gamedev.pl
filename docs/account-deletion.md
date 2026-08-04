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
saves, and private drafts are erased.

## Scheduler setup

The sweep has its own OIDC audience so a token minted for another internal job cannot be
replayed against it. It shares the existing `notify-sweep` service account.

```bash
SERVICE_URL="https://gamedev-app-334141807880.europe-west1.run.app"
SWEEP_URL="${SERVICE_URL}/api/internal/account-deletion-sweep"
SA="notify-sweep@gamedevpl.iam.gserviceaccount.com"

gh variable set ACCOUNT_DELETION_SWEEP_AUDIENCE --repo gamedevpl/www.gamedev.pl --body "$SWEEP_URL"

gcloud scheduler jobs create http account-deletion-sweep \
  --location europe-west1 \
  --project gamedevpl \
  --schedule "17 3 * * *" \
  --time-zone "Europe/Warsaw" \
  --uri "$SWEEP_URL" \
  --http-method POST \
  --oidc-service-account-email "$SA" \
  --oidc-token-audience "$SWEEP_URL"
```

If the job already exists, use `gcloud scheduler jobs update http` with the same arguments.
The deployment must carry both `ACCOUNT_DELETION_SWEEP_AUDIENCE` and `NOTIFY_SWEEP_SA`; an
unset value leaves the endpoint closed.

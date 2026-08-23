# Runbook: rotate secrets

The _recipes_ for each secret live in [`deployment.md`](../deployment.md). This runbook
adds what that page does not: the **order**, and the **verification step** — because the
failure mode here is not a bad rotation, it is a token quietly expiring on a Tuesday.

## 1. The expiry ledger lives in the ops repo

Fine-grained PATs expire, and expiry is a **scheduled, silent outage** that no monitoring
catches — nothing is wrong until the moment it is. So the dates have to be written down
somewhere, with a calendar reminder ~2 weeks ahead of each.

**That inventory is not here.** A table of every credential, what each one grants, when it
expires, and what breaks when it does is a map of the credential surface — useful to an
operator and equally useful to an attacker. It lives in the private ops repo
(`gamedevpl/www.gamedev.pl-ops`, `docs/credential-ledger.md`) along with the risk
register; see the `internal-ops-repo` skill for access.

What stays here is everything that is _already_ public knowledge from
[`deployment.md`](../deployment.md) — the secret names and how to rotate each one.

Two properties are worth stating in the open, because they constrain how these credentials
may be scoped and anyone touching the workflows needs them.

**`SITE_DISPATCH_TOKEN` cannot be granted narrowly.** `repository_dispatch` is gated by
Contents: read+write, so despite its name it is a _write-capable_ credential on the
platform repo, held by the games repo. Scope it to that single repository, and treat a leak
of it as a compromise of the platform repo rather than a nuisance.

**`agent-tasks-token` cannot be a machine identity.** GitHub's agent tasks API accepts only
_user-to-server_ tokens — App installation tokens are explicitly unsupported — so this is
necessarily a human's fine-grained PAT, carrying a human's expiry. There is no version of
it a service account can hold, which makes the calendar reminder the only mitigation. It is
deliberately separate from `github-token` so that a dispatch outage cannot become a serving
outage: see `createManagedPlatformBackendFromEnv` in `apps/api/src/agent-surface/agent-backend-env.ts`,
which returns `undefined` rather than throwing when the token is absent. **Since MP-04**
(the direct Copilot backend's retirement), this token alone is not sufficient either —
`MANAGED_AGENT_VENDOR=copilot` must also be selected, or the managed backend never starts
regardless of the token's presence.

## 2. Rotation order

Rotate one at a time, verifying between each. Nothing here is coupled, so a single bad
rotation should never cascade — but only if you can tell which one broke.

1. **Create the new credential** (do not revoke the old one yet).
2. **Store it** — Secret Manager version, or GitHub secret.
3. **Make it take effect**: Secret Manager values are read at container start, so a
   rotated GCP secret needs a new revision — redeploy, or force one:
   `gcloud run services update gamedev-app --region europe-west1 --project gamedevpl --update-env-vars ROTATED_AT=$(date -u +%s)`.
   GitHub Actions secrets take effect on the next workflow run.
4. **Verify** (§3).
5. **Only then revoke the old credential.** Reversing steps 4 and 5 is how a rotation
   becomes an outage.

## 3. Verification per secret

| Secret                    | Verify                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token`            | Submit a test spec, or `curl -s https://www.gamedev.pl/api/health` then check logs for GitHub auth errors                                                                                                                                                                                                 |
| `agent-tasks-token`       | Submit a test spec and confirm it gains a `dispatch` record instead of sitting at `queued`. Requires `MANAGED_AGENT_VENDOR=copilot` to be set — the `managed agent dispatch enabled` log line proves only that the vendor and token were both _present_ at container start, before anything is dispatched |
| `GAMES_REPO_TOKEN`        | Re-run the _Publish games snapshot_ workflow — it reads the games repo and must go green                                                                                                                                                                                                                  |
| `SITE_DISPATCH_TOKEN`     | Merge anything trivial to the games repo `main`; a _Publish games snapshot_ run must appear in the platform repo within a minute                                                                                                                                                                          |
| `session-secret`          | ⚠️ Rotating this **invalidates every session** — every user is signed out. Not a routine rotation; do it deliberately, ideally announced                                                                                                                                                                  |
| `submission-token-secret` | ⚠️ Invalidates outstanding submission status links. Same caution                                                                                                                                                                                                                                          |
| `resend-api-key`          | `npm run beta:invite -w @gamedevpl/api -- you@example.com --dry-run`, then a real send to yourself                                                                                                                                                                                                        |
| `vapid-private-key`       | ⚠️ Invalidates every existing push subscription; users must re-subscribe                                                                                                                                                                                                                                  |

The three marked ⚠️ are **user-visible** rotations. They are not emergencies to be done
quickly — they are changes to be scheduled.

### `agent-tasks-token`, end to end

The one credential where the whole §2 order matters in a single sitting, because revoking
before verifying stops every build. Nothing here touches IAM: `secretAccessor` is already
granted to the Cloud Run runtime SA on the secret, and adding a version does not change it.

```bash
# 1. New version of the EXISTING secret — not a new secret, and not an Actions secret.
#    Stdin keeps the value out of shell history: paste, then Ctrl-D.
gcloud secrets versions add agent-tasks-token --data-file=- --project gamedevpl

# 2. Make it take effect. The env var maps to agent-tasks-token:latest and Cloud Run
#    resolves that at instance start, so without a new revision the cutover happens
#    whenever instances happen to recycle. Re-asserting the mapping forces one without
#    leaving a stray ROTATED_AT behind.
gcloud run services update gamedev-app --region europe-west1 --project gamedevpl \
  --update-secrets=AGENT_TASKS_TOKEN=agent-tasks-token:latest

# 3. Verify with a real submission (see the table above), then disable rather than
#    destroy — disabling is reversible for the minutes when it still might not be.
gcloud secrets versions disable <OLD_VERSION> --secret=agent-tasks-token --project gamedevpl
```

Revoke the old PAT on GitHub last.

**When minting the replacement**, the scope is `Agent tasks: read and write` on the games
repo. Two things bite here:

- A fine-grained PAT is **capped by its owning account's own access**. Mint it on an
  account with only read on the games repo and the token page will show write while every
  call 403s at runtime. The token settings page is not the authority; the account's repo
  access is.
- It belongs to a _person_, so the dependency is that person's account staying healthy —
  not only the expiry date. A 2FA reset, an account recovery, or that person losing repo
  access stops creation exactly the same way an expiry does.

## 4. Compromise, rather than routine rotation

Order changes when a credential is believed leaked: **revoke first, restore service
second.** A broken site is recoverable; an attacker with a live token is not bounded.

1. Revoke the credential at its source (GitHub token settings, or disable the Secret
   Manager version).
2. Assess the blast radius using the ledger in the ops repo — `SITE_DISPATCH_TOKEN` and
   `github-token` both imply _write_ access to a repository.
3. Check what was done with it: the games repo's and platform repo's audit log, recent
   commits, workflow runs, and any issues or PRs created.
4. Then rotate normally (§2).
5. Write the incident up in the ops repo.

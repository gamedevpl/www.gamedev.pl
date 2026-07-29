# Runbook: rotate secrets, and the PAT expiry ledger

The *recipes* for each secret live in [`deployment.md`](../deployment.md). This runbook
adds what that page does not: the **order**, the **verification step**, and the
**expiry ledger** — because the failure mode here is not a bad rotation, it is a token
quietly expiring on a Tuesday.

## 1. The expiry ledger ⚠️

Fine-grained PATs expire. Expiry is a **scheduled, silent outage** that no monitoring
catches, because nothing is wrong until the moment it is. Keep this table current, and
set a calendar reminder ~2 weeks before each date.

| Credential | Lives in | Grants | Expires | Reminder set |
| --- | --- | --- | --- | --- |
| `github-token` | GCP Secret Manager | Issues rw + PRs r + Contents r on the games repo | ⚠️ **unrecorded — fill this in** | ☐ |
| `GAMES_REPO_TOKEN` | GitHub Actions secret (platform repo) | Contents:read on the games repo | ⚠️ **unrecorded — fill this in** | ☐ |
| `SITE_DISPATCH_TOKEN` | GitHub Actions secret (**games** repo) | Contents:**read+write** on the platform repo | ⚠️ **unrecorded — fill this in** | ☐ |

Read the real dates from GitHub → Settings → Developer settings → Fine-grained tokens,
and replace the placeholders above. Doing that is item 7 of the O1 gate.

**On `SITE_DISPATCH_TOKEN` specifically:** `repository_dispatch` cannot be granted more
narrowly than Contents: read+write, so despite its name this is a *write-capable*
credential on the platform repo, held by the games repo. Treat a leak of it as a
compromise of the platform repo, not as a nuisance. Scope it to that single repository
and nothing else.

### What breaks when each one expires

| Credential | Symptom |
| --- | --- |
| `github-token` | Submissions fail; previews and drafts fail. Published play keeps working (snapshot) |
| `GAMES_REPO_TOKEN` | The games-repo contract check fails in CI; **the snapshot bake fails**, so the catalog silently freezes at its last good bake |
| `SITE_DISPATCH_TOKEN` | No symptom at all — merges to the games repo stop triggering bakes, and the site serves a stale catalog until the nightly safety bake covers it |

The last row is the one to worry about: it fails *invisibly*. The nightly bake bounds the
damage to a day, and the games-repo workflow warns rather than failing when the secret is
absent — which is friendly, and also why nobody would notice.

## 2. Rotation order

Rotate one at a time, verifying between each. Nothing here is coupled, so a single bad
rotation should never cascade — but only if you can tell which one broke.

1. **Create the new credential** (do not revoke the old one yet).
2. **Store it** — Secret Manager version, or GitHub secret.
3. **Make it take effect**: Secret Manager values are read at container start, so a
   rotated GCP secret needs a new revision — redeploy, or
   `gcloud run services update gamedev-app --region europe-west1 --project gamedevpl
   --update-env-vars ROTATED_AT=$(date -u +%s)` to force one. GitHub Actions secrets take
   effect on the next workflow run.
4. **Verify** (§3).
5. **Only then revoke the old credential.** Reversing steps 4 and 5 is how a rotation
   becomes an outage.

## 3. Verification per secret

| Secret | Verify |
| --- | --- |
| `github-token` | Submit a test spec, or `curl -s https://www.gamedev.pl/api/health` then check logs for GitHub auth errors |
| `GAMES_REPO_TOKEN` | Re-run the *Publish games snapshot* workflow — it reads the games repo and must go green |
| `SITE_DISPATCH_TOKEN` | Merge anything trivial to the games repo `main`; a *Publish games snapshot* run must appear in the platform repo within a minute |
| `session-secret` | ⚠️ Rotating this **invalidates every session** — every user is signed out. Not a routine rotation; do it deliberately, ideally announced |
| `submission-token-secret` | ⚠️ Invalidates outstanding submission status links. Same caution |
| `resend-api-key` | `npm run beta:invite -w @gamedevpl/api -- you@example.com --dry-run`, then a real send to yourself |
| `vapid-private-key` | ⚠️ Invalidates every existing push subscription; users must re-subscribe |

The three marked ⚠️ are **user-visible** rotations. They are not emergencies to be done
quickly — they are changes to be scheduled.

## 4. Compromise, rather than routine rotation

Order changes when a credential is believed leaked: **revoke first, restore service
second.** A broken site is recoverable; an attacker with a live token is not bounded.

1. Revoke the credential at its source (GitHub token settings, or disable the Secret
   Manager version).
2. Assess the blast radius using the table in §1 — `SITE_DISPATCH_TOKEN` and
   `github-token` both imply *write* access to a repository.
3. Check what was done with it: the games repo's and platform repo's audit log, recent
   commits, workflow runs, and any issues or PRs created.
4. Then rotate normally (§2).
5. Write the incident up in the ops repo.

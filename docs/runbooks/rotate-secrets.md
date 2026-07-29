# Runbook: rotate secrets

The *recipes* for each secret live in [`deployment.md`](../deployment.md). This runbook
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

What stays here is everything that is *already* public knowledge from
[`deployment.md`](../deployment.md) — the secret names and how to rotate each one.

One property worth stating in the open, because it constrains how the credential may be
scoped and anyone touching the workflow needs it: **`SITE_DISPATCH_TOKEN` cannot be
granted narrowly.** `repository_dispatch` is gated by Contents: read+write, so despite its
name it is a *write-capable* credential on the platform repo, held by the games repo.
Scope it to that single repository, and treat a leak of it as a compromise of the platform
repo rather than a nuisance.

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
2. Assess the blast radius using the ledger in the ops repo — `SITE_DISPATCH_TOKEN` and
   `github-token` both imply *write* access to a repository.
3. Check what was done with it: the games repo's and platform repo's audit log, recent
   commits, workflow runs, and any issues or PRs created.
4. Then rotate normally (§2).
5. Write the incident up in the ops repo.

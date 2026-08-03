# Read-only GCP access — how an agent investigates prod without being able to break it

> Status: ✅ **Live** since 2026-08-01. Account: `agent-investigator@gamedevpl.iam.gserviceaccount.com`,
> created by [`infra/setup-agent-readonly.sh`](../infra/setup-agent-readonly.sh).

## The problem

[`agent-access-tokens.md`](./agent-access-tokens.md) solves authenticating to the _product_.
This solves the other half: reading the _infrastructure_. Every runbook in
[`runbooks/`](./runbooks/README.md) is a sequence of `gcloud` commands, and until now only
the owner could run them. An agent asked "why is the site 5xx-ing" could read the code and
guess, but could not look at a single log line — so triage was gated on a human being awake.

The obvious shortcut — hand agents the owner's credentials — fails on the same principle as
a secret-gated test-login route: it is not the reading that is dangerous, it is that the same
credential can also delete the database.

## What was rejected, and why it matters

| Option                                 | Why not                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Share the owner's `gcloud` credentials | Project owner. An agent misreading a runbook could delete a service, rotate a secret, or read every player's Firestore document. Nothing about the task requires any of that. |
| Grant the basic `roles/viewer`         | The primitive role is a superset of Firestore reads and secret metadata across the whole project. "Viewer" sounds bounded and is not.                                         |
| Reuse `github-actions-deployer`        | It holds `run.admin` and `storage.admin` — write access, and reach into the Firestore backup bucket. A read credential must not be the deploy credential.                     |
| A human Google account per agent       | Costs a Workspace seat, needs a password in every VM, and its actions are attributed to a person who did not perform them.                                                    |

A dedicated service account with only Viewer roles gives an audit trail attributable to the
agent, one revocation point, and a credential whose worst-case leak discloses operational
state rather than user data.

## What it can do

`logging.viewer`, `monitoring.viewer`, `run.viewer`, `cloudbuild.builds.viewer`,
`artifactregistry.reader`, `errorreporting.viewer`, `cloudscheduler.viewer`,
`workflows.viewer`, `secretmanager.viewer`, `serviceusage.serviceUsageViewer`, plus
`storage.objectViewer` on `gamedevpl-games-snapshots` and `gamedevpl-games-store` only.

That covers most of [`site-down-triage.md`](./runbooks/site-down-triage.md): revision
history, service config, error logs, latency metrics, build history, and the published
games snapshot.

## What it deliberately cannot do

Verified 2026-08-01 against the live project — `projects:testIamPermissions` returned only
`logging.logEntries.list`, `monitoring.timeSeries.list` and `run.services.get` out of
fourteen probed permissions.

| Denied                             | Why                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore, entirely                | Firestore IAM has no collection-level scope, so "read the schema" and "read every player's account" are one grant. Same reasoning as `erase-verifier`.  |
| `secretmanager.versions.access`    | Secret _payloads_. `secretmanager.viewer` still shows names, versions and enable state — which is what diagnoses "is it set / is it the stale version". |
| Data Access logs                   | `logging.viewer`, not `privateLogViewer`. Those logs carry per-user request detail.                                                                     |
| `gs://gamedevpl-firestore-backups` | Full Firestore exports. Bucket-scoped grants elsewhere exist precisely so this one is reachable by nothing that an agent holds.                         |
| Every write, everywhere            | No `*.update`, `*.create`, `*.delete`, or `setIamPolicy` on any service.                                                                                |

**Two [`site-down-triage.md`](./runbooks/site-down-triage.md) steps are closed to this
credential, and that is expected — not a symptom.** During an outage, do not read either as
evidence of breakage:

- step 4's `firestore databases describe` → `PERMISSION_DENIED`
- step 3's `storage buckets get-iam-policy` → `does not have storage.buckets.getIamPolicy`

Escalate those two to the owner rather than working around them. Everything else in that
runbook — revision history, service config, error logs, and `storage cat` of the games
snapshot — works, verified 2026-08-01.

## Agents do not have gcloud — use `infra/gcp-read.mjs`

Every runbook is written in `gcloud`, which the owner has and **cloud agent sandboxes do
not**. Installing it per session is a ~100 MB download through a restricted egress proxy, so
the tooling goes the other way: [`infra/gcp-read.mjs`](../infra/gcp-read.mjs) calls the GCP
REST APIs directly using `google-auth-library`, which is already in `node_modules` via
`@google-cloud/firestore`. No install step, no CLI.

```bash
node infra/gcp-read.mjs whoami                          # which permissions do I actually hold?
node infra/gcp-read.mjs logs --since 2h --limit 50      # Cloud Run logs
node infra/gcp-read.mjs logs 'severity>=ERROR' --limit 20
node infra/gcp-read.mjs services                        # what is deployed
node infra/gcp-read.mjs revisions gamedev-app           # what changed, newest first
node infra/gcp-read.mjs describe gamedev-app            # full service config
node infra/gcp-read.mjs raw GET <any GCP REST url>      # anything not wrapped above
```

### MCP / self-build debugging

ChatGPT Apps and some other MCP clients drop `isError` tool payloads from the chat
transcript, so a failed `get_brief` after a successful `start` can look like “no
response”. The API writes structured lines for that path (never the `sessionKey` or
Bearer secret):

```bash
# Tool-level refusals: reason, tool, bearerKind, sessionKeyShape, jobId, sessionIdMismatch, ua
node infra/gcp-read.mjs logs 'jsonPayload.event="mcp_tool_refused" OR jsonPayload.msg="mcp tool refused"' --since 6h --limit 50

# Successful start() binds (jobId, slug, transport sessionId)
node infra/gcp-read.mjs logs 'jsonPayload.event="mcp_session_started" OR jsonPayload.msg="mcp session started"' --since 6h --limit 50

# HTTP 401 OAuth challenge (no sessionKey / Bearer on tools/call)
node infra/gcp-read.mjs logs 'jsonPayload.event="mcp_oauth_challenge" OR jsonPayload.msg="mcp oauth challenge"' --since 6h --limit 50

# Client sent an Mcp-Session-Id this instance does not know (multi-instance / stale)
node infra/gcp-read.mjs logs 'jsonPayload.event="mcp_unknown_session" OR jsonPayload.msg="mcp unknown session"' --since 6h --limit 50

# HTTP shape next to those lines (responseSize includes headers)
node infra/gcp-read.mjs logs 'resource.type="cloud_run_revision" AND httpRequest.requestUrl=~"/api/mcp" AND httpRequest.userAgent=~"openai|claude"' --since 6h --limit 50
```

`raw` is the escape hatch: any runbook `gcloud` step has a REST equivalent, and the credential
— not the wrapper — is what stops a mutation. Start with `whoami`; if a command 403s, that
output tells you immediately whether it is a permission boundary or a real fault.

## Credentials

The script resolves them in this order, so the same commands work everywhere:

| Environment                           | Set this                                  | Key on disk?          |
| ------------------------------------- | ----------------------------------------- | --------------------- |
| Cloud sandbox (Claude web, Cursor)    | `GCP_READONLY_KEY_B64`                    | No — parsed in memory |
| Laptop (Claude Code, owner's machine) | `GCP_IMPERSONATE_SA=agent-investigator@…` | No — 1h token         |
| GitHub Actions / Copilot              | nothing; WIF sets ADC                     | No                    |

**Cloud sandboxes** have no OIDC identity Google will trust, so a credential must be injected.
Agent environments accept only single-line env vars while the key is multi-line JSON, hence
base64. The owner sets `GCP_READONLY_KEY_B64` once in the environment's secret settings.

**Laptops** need no key at all — the owner's account holds `serviceAccountTokenCreator` on the
SA. Export `GCP_IMPERSONATE_SA` and the run drops to exactly the sandbox's permissions, which
is also the cheapest way to reproduce "why did the agent get a 403".

**GitHub Actions** authenticates keylessly through the existing `github-pool` provider:

```yaml
service_account: agent-investigator@gamedevpl.iam.gserviceaccount.com
```

The sandbox still needs `*.googleapis.com` reachable through its egress proxy. That failure
looks like a credential problem and is not one.

## Rotation

The sandbox key is the only long-lived credential here; the other two paths mint short-lived
tokens and need no rotation. To rotate:

```bash
gcloud iam service-accounts keys list --iam-account=agent-investigator@gamedevpl.iam.gserviceaccount.com --managed-by=user
gcloud iam service-accounts keys create ./k.json --iam-account=agent-investigator@gamedevpl.iam.gserviceaccount.com --project=gamedevpl
base64 -i k.json | tr -d '\n' > agent-key.b64   # paste into the agent env, then rm both files
gcloud iam service-accounts keys delete <OLD_KEY_ID> --iam-account=agent-investigator@gamedevpl.iam.gserviceaccount.com --project=gamedevpl
```

Do not route the encoded key through the clipboard — copying anything else, including the
variable name, silently destroys it. `*-key.json` and `*.b64` are gitignored.

To revoke agent access entirely, delete the service account: every path above dies with it,
and nothing else in the project depends on it.

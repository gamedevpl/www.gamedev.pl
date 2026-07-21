# Deployment (Terraform + GitHub Actions)

> **Status: 📋 Design only. Nothing built.** `infra/` is still an empty placeholder, and
> GCP remains a **lean, not a decision**. This documents the intended shape and — more
> usefully — the things that will break if we deploy the current design as-is.

## The architectural catch: `docker run` doesn't survive the move to the cloud ⚠️

Today `ContainerGameGenerator` shells out to `docker run` on the same machine as the API.
That works locally and **does not translate to a managed runtime**. Cloud Run (and similar)
won't let a service spawn sibling containers; docker-in-docker is either unavailable or a
privileged, security-hostile workaround — and "privileged container running attacker-shaped
prompts" is exactly what [`security-model.md`](./security-model.md) says not to build.

So the cloud execution path is a **different implementation of the same seam**, not a config
change:

|                  | Local                    | Cloud                                                          |
| ---------------- | ------------------------ | -------------------------------------------------------------- |
| Mechanism        | `docker run --rm …`      | Create a **Cloud Run Job execution** (or equivalent)           |
| Implementation   | `ContainerGameGenerator` | a sibling, e.g. `CloudRunJobGenerator`                         |
| Result retrieval | container stdout         | job writes the bundle to object storage; orchestrator reads it |

The good news: the `GameGenerator` seam already makes this a drop-in. The orchestrator, API,
and web app don't change. Plan for the sibling implementation rather than trying to make
`docker run` work in a managed runtime.

**Corollary for the queue:** `packages/orchestrator` is in-memory and in-process. That's fine
for one box; it does not survive restarts or span instances. Anything beyond a single
instance needs a durable queue (Cloud Tasks / Pub/Sub) and a job store outside process memory.

---

## Target shape (GCP lean)

| Component           | Service                    | Notes                                                             |
| ------------------- | -------------------------- | ----------------------------------------------------------------- |
| Web (`apps/web`)    | Static hosting + CDN       | Pure static build output                                          |
| **Generated games** | **Separate origin/bucket** | Must be a distinct, cookieless domain — see the security model    |
| API (`apps/api`)    | Cloud Run (service)        | Scale-to-zero friendly                                            |
| Agent runs          | Cloud Run **Jobs**         | One execution per generation job; matches the bursty/idle profile |
| Auth proxy          | Cloud Run (internal only)  | Holds the provider key; **the job never does**                    |
| Queue               | Cloud Tasks / Pub/Sub      | Replaces the in-memory queue                                      |
| Game/job storage    | Cloud Storage + a database | Also unlocks the "play others' games" loop                        |
| Secrets             | Secret Manager             | Terraform manages _references_, never values                      |

Sizing is deliberately unspecified — traffic is expected to be mostly idle with bursts, so
scale-to-zero is the lean, with a possible tiny warm pool if cold starts prove painful
(see [`container-orchestration.md`](./container-orchestration.md#scale-to-zero-vs-warm-pool)).

### Terraform conventions

- **Never put secret _values_ in Terraform.** Create the Secret Manager secret and grant
  access; populate the value out-of-band. Otherwise the secret lands in state — and Terraform
  state is a credential store people forget to protect.
- **Remote state** in a versioned, access-controlled bucket with locking. Not local, not
  committed.
- Separate **environments** (at minimum staging/prod) with separate state and separate
  service accounts.
- One service account per component, each with the **minimum** roles it needs. The agent-job
  service account in particular should have almost nothing — it runs untrusted work.
- Egress restrictions on the agent job are a **security control, not an optimisation**: it
  should reach the auth proxy and nothing else.

---

## GitHub Actions: making the pipeline secure

This is where a lot of real-world compromise happens, so it's worth being explicit.

### Non-negotiables

1. **OIDC / Workload Identity Federation — not long-lived cloud keys.** ⭐
   Do not create a service-account JSON key and paste it into repo secrets. A leaked
   long-lived cloud credential is the worst-case outcome. Federate GitHub's OIDC token to a
   GCP service account, scoped to this repo _and_ specific branches/environments.
2. **Least-privilege `permissions:`** at the workflow (and job) level. Default to
   `contents: read` and add only what's needed. Never leave the default broad token in place
   for a workflow that handles untrusted input.
3. **Pin third-party actions to a commit SHA**, not a moving tag. A tag can be repointed;
   that's a supply-chain takeover of your pipeline.
4. **Never use `pull_request_target` (or secrets) with untrusted PR code.** That combination
   is the classic way repos get their secrets stolen by a drive-by PR. Build/test untrusted
   PRs with **no** secrets and no deploy credentials.
5. **Protected environments for deploys** — required reviewers and branch restrictions on the
   production environment, so a merged PR can't silently ship.
6. **Deploy only from the intended branch.** Currently that's `the-new-gamedevpl`, which is
   the repo's default branch (see [`contributing-for-agents.md`](./contributing-for-agents.md)).

### Current state, honestly

- `ci.yml` runs the green gate (lint, type-check, test, build) on push/PR. Good baseline.
- There is **no deploy workflow at all** yet — the old GitHub Pages one was removed with the
  legacy site, and nothing replaced it. That's correct for now: there's nowhere to deploy to.
- ⚠️ `copilot-task.yml` is a stub that triggers on `workflow_dispatch`, `issue_comment`, and
  `repository_dispatch`, and currently just echoes an input. Comment-triggered workflows are a
  known escalation path; this one is harmless today but should be tightened or deleted rather
  than extended.
- ⚠️ Copilot-authored PRs currently sit in `action_required` — GitHub is gating their workflow
  runs pending approval. That's a _feature_, not a bug, but it means CI signal on those PRs is
  manual until the policy is deliberately configured.

### Image publishing

The agent-runner image needs to live in a registry (Artifact Registry). Build and push from
CI with OIDC-derived credentials, tag by commit SHA (not `latest`) so a job execution pins an
exact, auditable image. Note the image is now ~934MB with the CLI installed — worth a
multi-stage build or a slimmer base if pull latency starts mattering on cold starts.

---

## Sequencing

Deployment sensibly comes **after** the security work, not before — shipping the current
design to the internet would expose the credential-exfiltration path described in
[`security-model.md`](./security-model.md) to the public.

Rough order:

1. Auth proxy + no-key-in-container + egress restrictions (security prerequisites)
2. Durable queue + job/game storage (replaces in-memory state)
3. `CloudRunJobGenerator` (the cloud sibling of `ContainerGameGenerator`)
4. Terraform for the above, with OIDC-based CI deploys
5. Custom domains, including the separate games origin

## Open questions

- ⚠️ **Cloud provider is still open.** GCP is a lean; nothing is committed. Everything above
  maps to equivalents elsewhere.
- How are creators authenticated, and how does that interact with per-creator quotas?
- Do generated games live in object storage, in per-creator GitHub repos (the Phase 3 growth
  engine), or both?
- Cold-start latency budget for the first job after idle.

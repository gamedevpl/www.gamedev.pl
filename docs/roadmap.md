# Roadmap

Milestones as phases. Phase 0 is the current MVP slice; later phases are directional and
depend on unresolved diligence — see [`risks-and-open-questions.md`](./risks-and-open-questions.md).

Status legend: ✅ done · 🚧 in progress · 📋 planned/not started

---

## Phase 0 — MVP core loop (local) ✅

**Goal:** Prove `prompt → generated game → play it in the browser`, running entirely
locally, with a swappable generator seam and a sandboxed execution model.

**Key deliverables**

- ✅ npm-workspaces monorepo (`apps/web`, `apps/api`, `packages/game-generator`)
- ✅ Fastify API: `POST /api/generate-game`, `GET /api/health`, zod-validated input
- ✅ `GameGenerator` seam + `GameProject` (real HTML/JS/CSS) type
- ✅ `MockGameGenerator` (deterministic, keyword→template) returning `GameProject`
- ✅ React frontend: prompt form + play surface
- ✅ Sandboxed-iframe rendering (`sandbox="allow-scripts"`, no `allow-same-origin`)
- ✅ Tooling: TS strict, ESLint, Prettier, Husky pre-commit, Vitest, CI workflow

**Dependencies:** none (fully local).

**Status:** Full gate (`type-check && lint && test && build`) passes; the loop was
verified in-browser (prompt → generated dodge game → playable in the sandboxed iframe,
timer counting down, hazards falling). The earlier DSL packages are fully removed.

---

## Phase 1 — Real agentic generation in containers 📋

**Goal:** Replace the mock with a real agent (Claude Code / Codex / "agy") that generates
games as real code, run inside a **container** rather than via a per-token hosted API.

**Key deliverables**

- ✅ A container image (`containers/agent-runner/`) with a working dir + template. It is
  **agent-agnostic**: the CLI to run is injected via `AGENT_CMD`, never hardcoded.
- ✅ `ContainerGameGenerator` — a real `GameGenerator` that shells out to `docker run` and
  parses the emitted `GameProject`
- ✅ Output capture: `AGENT_MODE=external` copies the template to a scratch dir, runs the
  configured CLI against it, and collects `index.html`/`game.js`/`style.css` back into a
  `GameProject`. Verified end-to-end with a fake agent (zero cost).
- ✅ **Real `docker build` + `docker run`** — verified with the Docker daemon actually running:
  the image builds (313MB), `AGENT_MODE=mock` runs `--network none` and emits a valid
  `GameProject`, `AGENT_MODE=external` ran a real (fake, zero-cost) agent binary inside the
  container as the non-root `agent` user and correctly collected its edits, and the full stack
  (`LLM_PROVIDER=container`) served a generated game through the queue into the browser — the
  earlier "only the Node entrypoint was exercised" caveat no longer applies. One real bug found
  and fixed this pass: the non-root user couldn't `mkdir /out`, so the file-artifact output
  silently failed (stdout still worked) — fixed by pre-creating `/out` in the Dockerfile.
- 🚧 Pointing `AGENT_CMD` at a real coding CLI — **the wiring is proven; only a valid key is
  missing.** Verified with the real Claude Code CLI running inside the container against the
  auth proxy: the CLI honours `ANTHROPIC_BASE_URL`, sends the job token, and our proxy
  verified it (logged with the correct `jobId`) and forwarded two requests upstream. Anthropic
  then rejected the deliberately-fake upstream key with "Invalid API key · Fix external API
  key". So a real credential on **the proxy** (never the container) is the only remaining step
  before a genuine generation run.
  - Minor: the CLI probes `HEAD /` on the base URL, which the proxy answers 404. Harmless — it
    proceeded to the `/v1` calls regardless — but worth handling if a future client is stricter.
- 📋 Cost/latency measurement vs the mock baseline

**Dependencies:** Phase 0 stable. The plumbing is deliberately built so it does **not** depend
on the ToS question; choosing which agent/account actually runs inside still does.

**Open questions**

- ⚠️ **Blocker:** Are subscription-based CLIs (Pro/Max) licensed for always-on multi-tenant
  backend compute? Or is Team/Enterprise / per-token API required?
- 📋 Which agent(s) to support first; how to make generation deterministic enough to test.

---

## Phase 2 — Container orchestration layer 🚧

**Goal:** A layer that provisions an ephemeral container per creator job, accepts prompts
securely, and queues + throttles requests.

**Key deliverables**

- ✅ Job model (`id`, `creatorId`, `prompt`, `repoRef?`; states
  `queued → provisioning → running → succeeded/failed`) — `packages/orchestrator`
- ✅ Queue + throttling: global concurrency cap, per-creator cap so one creator can't
  monopolize capacity (and doesn't head-of-line block others), queue-depth backpressure.
  Failures are terminal — no blind retries, since agent runs are expensive and non-idempotent.
- ✅ Async API surface: `POST /api/jobs` (202) + `GET /api/jobs/:id` polling, so bursts don't
  hold requests open
- ✅ The web UI submits through the queue and surfaces each lifecycle state, so it's ready for
  generation that takes minutes rather than milliseconds
- 📋 **In-memory and in-process only** — the queue does not survive a restart and does not
  span instances. A durable/distributed queue is still needed.
- 📋 Real per-job container provisioning + tear-down driven by the orchestrator (today a job
  calls a `GameGenerator`; `ContainerGameGenerator` runs docker synchronously)
- 📋 Scale-to-zero on-demand execution (e.g. Cloud Run Jobs)
- 📋 (Optional, gated) multi-account rotation — **only if ToS allows**

**Dependencies:** Phase 1; cloud/runtime target chosen for the durable/hosted parts.

**Open questions**

- ⚠️ Scale-to-zero vs tiny warm pool for bursty/idle traffic (cold-start latency vs idle cost).
- ⚠️ **Blocker:** Rotating multiple personal accounts to dodge rate limits likely violates
  subscription ToS — get an explicit answer first. See [container-orchestration](./container-orchestration.md).

Full design: [`container-orchestration.md`](./container-orchestration.md).

---

## Phase 3 — GitHub growth engine 📋

**Goal:** Creators' games live in real GitHub repos; publishing is a GitHub Action.

**Key deliverables**

- 📋 Public game-template repo
- 📋 A "publish" GitHub Action that builds the static bundle and pushes it to gamedev.pl
- 📋 Compatibility with Copilot / Claude Code / Codex / human contributors
- 📋 (Later) a GitHub App/bot; an MCP/RAG docs endpoint

**Dependencies:** Phase 1 (real code output); auth/account model.

**Open questions**

- 📋 Repo-per-game ownership & permissions; how creators authenticate to GitHub.

---

## Phase 4 — Player remix → PR 📋

**Goal:** While playing, a player requests a change; an agent opens a **pull request** against
the original creator's repo. The AI never auto-merges into someone else's repo.

**Key deliverables**

- 📋 In-play "request a change" affordance
- 📋 Agent with **scoped** GitHub permissions that produces a diff and opens a PR
- 📋 A diff/preview step before the PR is opened
- 📋 Creator review & merge via normal GitHub flow

**Dependencies:** Phase 3 (games in repos); Phase 1 (agent).

**Open questions**

- 📋 Abuse controls on remix requests; rate limits; attribution.

Full spec: [`remix-to-pr.md`](./remix-to-pr.md).

---

## Phase 5 — Deployment (GCP / Terraform) 📋

**Goal:** Deploy beyond localhost.

**Key deliverables**

- 📋 Terraform for GCP (leaning Cloud Run for API + static hosting/CDN for web)
- 📋 Secrets management for the real generator
- 📋 CI/CD from the existing GitHub Actions workflow

**Dependencies:** Phases 1–2; cloud target confirmed.

**Open questions**

- ⚠️ GCP vs other cloud is **open / TBD**. `infra/` stays a placeholder until decided.

---

## At a glance

| Phase | Focus                                 | Status                                              |
| ----- | ------------------------------------- | --------------------------------------------------- |
| 0     | Local MVP core loop                   | ✅                                                  |
| 1     | Real agentic generation in containers | 🚧 (plumbing done; no real CLI wired yet)           |
| 2     | Container orchestration + queue       | 🚧 (in-process queue done; not durable/distributed) |
| 3     | GitHub growth engine                  | 📋                                                  |
| 4     | Player remix → PR                     | 📋                                                  |
| 5     | Deployment (GCP/Terraform)            | 📋                                                  |

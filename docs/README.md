# gamedev.pl — Project Documentation

> Documentation set for coding agents (GitHub Copilot, Claude Code, Codex) and humans
> picking up work on this repository. Written to be self-contained: read these before
> touching code.

## Elevator pitch

gamedev.pl is a catalog and creation surface for **AI-built games**. A creator submits a spec,
a coding agent writes real HTML/CSS/JS in a dedicated games repository, and review plus
validation gate publication. Players can request changes through the same spec-and-PR
workflow. This is **live in closed beta** at https://www.gamedev.pl — creators commission
games, agents build them, and published games play in the sandboxed player.

The pivot from the old static site of hand-built games is **done**, not in progress; that site
survives only in this repo's early history.

> ⚠️ **`master` is the default branch and the live one.** The old `the-new-gamedevpl`
> development branch was merged and no longer exists on the remote; earlier docs that
> describe `master` as frozen legacy content are wrong and are being corrected as they
> are touched. Tools that implicitly target "the default branch" — such as assigning a
> GitHub issue to Copilot's coding agent — correctly land on `master`.

## Current state

| Aspect          | State                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch          | `master` (default, live)                                                                                                                                                                                                                                                   |
| Shape           | npm-workspaces monorepo (`apps/*`, `packages/*`)                                                                                                                                                                                                                           |
| Frontend        | `apps/web` — Vite + React + TypeScript                                                                                                                                                                                                                                     |
| Backend         | `apps/api` — Fastify + TypeScript on Cloud Run (europe-west1)                                                                                                                                                                                                              |
| Game creation   | ✅ Live — spec → moderated submission → round dispatched to an agent backend → delivery over the build channel (`submit_sources`) → gate run → **operator approves** → publish. The gate records a verdict; it never publishes. See [`architecture.md`](./architecture.md) |
| Execution model | ✅ Each game is assembled into one self-contained HTML doc and run in a **sandboxed iframe** (`sandbox="allow-scripts allow-pointer-lock"`, no `allow-same-origin`)                                                                                                        |
| Games origin    | ✅ Served through the API rather than a public CDN, so the games repo can stay private and PR previews are playable                                                                                                                                                        |
| Auth & quotas   | ✅ Google sign-in, per-user daily counters, closed-beta allowlist + waitlist                                                                                                                                                                                               |
| Notifications   | ✅ In-app bell, email with unsubscribe, Web Push (desktop/Android)                                                                                                                                                                                                         |
| Multiplayer     | ✅ Party mode — one shared screen, phones as controllers (relay is in-process, hence one instance — splitting it out is built, see `deployment.md`)                                                                                                                        |
| Mobile          | ✅ Every catalog game is playable with a thumb, **enforced in CI** from each game's source. No PWA/install path yet                                                                                                                                                        |
| Device sensing  | 🚧 Tilt play shipped; camera backdrop in flight — the shell reads sensors / `getUserMedia` on its own origin (`apps/web/src/sensing.ts`; games-repo `docs/camera-ar-platform.md`). Frames and raw readings never leave the browser; the iframe sandbox is unchanged        |
| Shared contract | `packages/contract` — route tables, status vocabularies, response shapes, protocol versions                                                                                                                                                                                |
| Local dev       | ✅ Whole product runs with no keys — bundled fixture games and a dev sign-in (`local-development.md`)                                                                                                                                                                      |
| Legal           | ✅ Terms, privacy policy, AI disclosure, and a DSA notice-and-action route are published                                                                                                                                                                                   |
| Orchestration   | 🗃️ Self-hosted agent execution abandoned for legal reasons (see `games-repo.md`); ✅ hosted Anthropic managed builder (MCP + per-round vault) is live when valid configuration selects it through the environment registry (`managed-agent-backend.md`)                    |
| Deployment      | ✅ GitHub Actions → Cloud Run via Workload Identity Federation; no IaC (`infra/` is scripts)                                                                                                                                                                               |
| After publish   | 🚧 Visits and per-game health are measured and readable by the operator; acting on the signal is still design (`improvement-loop-plan.md`)                                                                                                                                 |

## Documents in this folder

| File                                                               | What's in it                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [`vision.md`](./vision.md)                                         | Product vision and the three core loops (create / play / remix)                                         |
| [`architecture.md`](./architecture.md)                             | How the shipped system is built: workspaces, API buckets, web surfaces, the two catalog lanes, flows    |
| [`roadmap.md`](./roadmap.md)                                       | Phased milestones with goals, deliverables, dependencies, open questions                                |
| [`games-repo.md`](./games-repo.md)                                 | **The current architecture — games will live in a repo maintained by coding agents. Read this first.**  |
| [`games-repo-blueprint.md`](./games-repo-blueprint.md)             | Concrete layout, validation, publishing, and issue-first implementation plan                            |
| [`games-snapshot.md`](./games-snapshot.md)                         | Published games are baked to Cloud Storage on merge, so playing no longer rebuilds them from GitHub     |
| [`security-model.md`](./security-model.md)                         | Threat model. The credential-exfiltration finding is **dissolved** by the games-repo pivot              |
| [`agent-adapters.md`](./agent-adapters.md)                         | Common repository contract for Claude Code / Codex / agy / Copilot                                      |
| [`managed-agent-backend.md`](./managed-agent-backend.md)           | Vendor-neutral seam for running the platform builder on a hosted agent platform                         |
| [`deployment.md`](./deployment.md)                                 | Minimal delivery shape for the app, games origin, and submission API                                    |
| [`container-orchestration.md`](./container-orchestration.md)       | **Archived** design for the removed self-hosted generation direction                                    |
| [`remix-to-pr.md`](./remix-to-pr.md)                               | Spec for the player-remix → pull-request feature                                                        |
| [`own-ide-checkout.md`](./own-ide-checkout.md)                     | 🚧 A working copy for creators who prefer their own IDE — checkout, deliver back, one delivery contract |
| [`cli-status-poll.md`](./cli-status-poll.md)                       | How a non-browser client watches a round: one status read, poll cadence, backoff (CL-12)                |
| [`cli-pre-job-intake.md`](./cli-pre-job-intake.md)                 | Pre-game REPL talk is a server-side intake agent (`POST /api/cli/chat`); a game starts only on intent   |
| [`../apps/cli/README.md`](../apps/cli/README.md)                   | `gamedevpl` terminal client in this repo — public page: `/connect`                                      |
| [`notifications-plan.md`](./notifications-plan.md)                 | Notify creators/players of transitions: detection sweep, per-user storage, in-app → email → push        |
| [`creator-qa-plan.md`](./creator-qa-plan.md)                       | Clarifying-questions pass before spec freeze — raises the hit rate of the one-shot agent run            |
| [`improvement-loop-plan.md`](./improvement-loop-plan.md)           | After publish: player signals → per-game scorecard → agent-assisted fixes and suggestions               |
| [`game-assessment-plan.md`](./game-assessment-plan.md)             | ✅ Reviewer role + `/review` swipe desk; Copy JSON → agent plan (`ingest-desk-reviews`)                 |
| [`how-to-play-plan.md`](./how-to-play-plan.md)                     | Richer How to play (Goal / Scoring in `.legend-keys`) — decision, schema, phased catalog seal           |
| [`path-routing-plan.md`](./path-routing-plan.md)                   | ✅ Path URLs for deep links (`/play/<slug>`, …) — History API, no hashbang                              |
| [`recommendations.md`](./recommendations.md)                       | ✅ Home catalog sort from scorecards + signed-in play affinity                                          |
| [`runbooks/`](./runbooks/README.md)                                | ✅ Incident procedures: site-down triage, deploy rollback, Firestore restore, secret rotation           |
| [`contributing-for-agents.md`](./contributing-for-agents.md)       | How agents run, structure, and contribute to this repository                                            |
| [`comment-prose-debt.md`](./comment-prose-debt.md)                 | ✅ Comment seal: // one-liners ≤12 words; per-file baseline ratchet (`npm run comment-prose`)           |
| [`module-size-debt.md`](./module-size-debt.md)                     | ✅ No file may grow past its baseline; new files cap at 500 lines (`npm run module-size`)               |
| [`local-development.md`](./local-development.md)                   | ✅ Running the whole product on a laptop with no keys — start here to contribute                        |
| [`multiplayer-plan.md`](./multiplayer-plan.md)                     | ✅ Party mode: shared screen, phones as controllers, slot model, in-process relay                       |
| [`persistent-world-plan.md`](./persistent-world-plan.md)           | Shared persistent worlds ("the Ultima Online question") — P1 saves ✅ built, P2/P3 💭 concept           |
| [`auth-and-usage-plan.md`](./auth-and-usage-plan.md)               | ✅ Google sign-in, sessions, per-user quotas                                                            |
| [`agent-access-tokens.md`](./agent-access-tokens.md)               | ✅ How an agent in a cloud VM authenticates without a browser or a Google account                       |
| [`agent-gcp-access.md`](./agent-gcp-access.md)                     | ✅ Read-only GCP credential + `infra/gcp-read.mjs` so an agent can triage prod without gcloud           |
| [`account-deletion.md`](./account-deletion.md)                     | 14-day recovery window, operator protection, and cleanup sweep setup                                    |
| [`content-safety-plan.md`](./content-safety-plan.md)               | ✅ Moderation of submitted specs before an agent ever sees them                                         |
| [`agent-live-channel-plan.md`](./agent-live-channel-plan.md)       | ✅ How a working agent reports progress to the creator in seconds, not commits                          |
| [`closed-beta-launch-plan.md`](./closed-beta-launch-plan.md)       | The launch that put the closed beta on the domain                                                       |
| [`closed-beta-splash-plan.md`](./closed-beta-splash-plan.md)       | What an anonymous visitor sees while the beta is gated                                                  |
| [`games-repo-validation-spec.md`](./games-repo-validation-spec.md) | What CI in the games repo must prove before a game can publish                                          |
| [`agent-progress-notes.md`](./agent-progress-notes.md)             | The older commit-based progress journal, superseded by the live channel                                 |
| [`steel-thread-plan.md`](./steel-thread-plan.md)                   | 🗃️ Historical — the milestone plan that got the first end-to-end thread working                         |
| [`live-editing-latency.md`](./live-editing-latency.md)             | 🚧 Per-phase timing on the staged-preview rebuild path, ahead of the fast-lane work                     |

## Internal docs — private ops repo

Strategy, risk, legal, and ops docs are **not in this folder**. They live in the private
[`www.gamedev.pl-ops`](https://github.com/gamedevpl/www.gamedev.pl-ops) repo
([its docs index](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/README.md)):
`gtm-plan.md`, `risks-and-open-questions.md`, `legal-compliance-plan.md`,
`operational-readiness-plan.md`, `store-accounts-setup.md`, `creator-experience-review.md`,
`mobile-app-plan.md`, `store-launch-plan.md`.
They moved there in 2026-07 and remain **required context** for planning and
strategy/ops/legal work — see
[`internal-ops-repo`](../.claude/skills/internal-ops-repo/SKILL.md) for access and the
rules against leaking their content into this public repo.

## Shared agent playbooks

Kept under `.claude/skills/` so Claude Code auto-loads them, but written to be
**agent-agnostic** — read them whichever agent you are:

| Playbook                                                                    | When it applies                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`verify-agent-work`](../.claude/skills/verify-agent-work/SKILL.md)         | Reviewing, verifying, or merging work you didn't write yourself         |
| [`copilot-orchestration`](../.claude/skills/copilot-orchestration/SKILL.md) | Delegating work to GitHub Copilot's remote coding agent                 |
| [`game-asset-generation`](../.claude/skills/game-asset-generation/SKILL.md) | Dynamically generating, styling, and composing game assets              |
| [`internal-ops-repo`](../.claude/skills/internal-ops-repo/SKILL.md)         | Where the private strategy/risk/legal/ops docs live and how to use them |

Both must be **updated when they turn out to be wrong or incomplete** — see the
self-improvement clause at the end of each.

## Status legend

✅ Done / in place &nbsp;&nbsp; 🚧 In progress &nbsp;&nbsp; 📋 Planned / not built &nbsp;&nbsp; ⚠️ Risk or open question

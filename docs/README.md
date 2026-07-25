# gamedev.pl — Project Documentation

> Documentation set for coding agents (GitHub Copilot, Claude Code, Codex) and humans
> picking up work on this repository. Written to be self-contained: read these before
> touching code.

## Elevator pitch

gamedev.pl is pivoting from a static site of hand-built open-source games into a catalog and
creation surface for **AI-assisted games**. A creator submits a spec, a coding agent proposes
real HTML/CSS/JS in a dedicated games repository, and review plus validation gate publication.
Players can later request changes through the same spec-and-PR workflow. This is **live in
closed beta** at https://www.gamedev.pl — creators commission games, agents build them, and
published games play in the sandboxed player.

> ⚠️ **`master` is the default branch and the live one.** The old `the-new-gamedevpl`
> development branch was merged and no longer exists on the remote; earlier docs that
> describe `master` as frozen legacy content are wrong and are being corrected as they
> are touched. Tools that implicitly target "the default branch" — such as assigning a
> GitHub issue to Copilot's coding agent — correctly land on `master`.

## Current state

| Aspect          | State                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch          | `master` (default, live)                                                                                                                         |
| Shape           | npm-workspaces monorepo (`apps/*`, `packages/*`)                                                                                                 |
| Frontend        | `apps/web` — Vite + React + TypeScript                                                                                                           |
| Backend         | `apps/api` — Fastify + TypeScript on Cloud Run (europe-west1)                                                                                    |
| Game creation   | ✅ Live — spec → moderated submission → games-repo issue → coding agent PR → human review → publish                                              |
| Execution model | ✅ Each game is assembled into one self-contained HTML doc and run in a **sandboxed iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`) |
| Games origin    | ✅ Served through the API rather than a public CDN, so the games repo can stay private and PR previews are playable                              |
| Auth & quotas   | ✅ Google sign-in, per-user daily counters, closed-beta allowlist + waitlist                                                                     |
| Notifications   | ✅ In-app bell, email with unsubscribe, Web Push (desktop/Android)                                                                               |
| Generator seam  | `packages/game-generator` — deterministic **mock only**, a development preview route                                                             |
| Orchestration   | 🗃️ Removed — self-hosted agent execution was abandoned for legal reasons (see `games-repo.md`)                                                   |
| Deployment      | ✅ GitHub Actions → Cloud Run via Workload Identity Federation; no IaC yet (`infra/` is scripts)                                                 |
| After publish   | 📋 Nothing is measured yet — see `improvement-loop-plan.md`                                                                                      |

## Documents in this folder

| File                                                           | What's in it                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`vision.md`](./vision.md)                                     | Product vision and the three core loops (create / play / remix)                                        |
| [`architecture.md`](./architecture.md)                         | Working local preview + agreed games-repo product architecture                                         |
| [`roadmap.md`](./roadmap.md)                                   | Phased milestones with goals, deliverables, dependencies, open questions                               |
| [`games-repo.md`](./games-repo.md)                             | **The current architecture — games will live in a repo maintained by coding agents. Read this first.** |
| [`games-repo-blueprint.md`](./games-repo-blueprint.md)         | Concrete layout, validation, publishing, and issue-first implementation plan                           |
| [`security-model.md`](./security-model.md)                     | Threat model. The credential-exfiltration finding is **dissolved** by the games-repo pivot             |
| [`agent-adapters.md`](./agent-adapters.md)                     | Common repository contract for Claude Code / Codex / agy / Copilot                                     |
| [`deployment.md`](./deployment.md)                             | Minimal delivery shape for the app, games origin, and submission API                                   |
| [`container-orchestration.md`](./container-orchestration.md)   | **Archived** design for the removed self-hosted generation direction                                   |
| [`remix-to-pr.md`](./remix-to-pr.md)                           | Spec for the player-remix → pull-request feature                                                       |
| [`mobile-app-plan.md`](./mobile-app-plan.md)                   | iOS/Android strategy: mobile web → PWA → Capacitor store apps; games touch contract                    |
| [`notifications-plan.md`](./notifications-plan.md)             | Notify creators/players of transitions: detection sweep, per-user storage, in-app → email → push       |
| [`creator-qa-plan.md`](./creator-qa-plan.md)                   | Clarifying-questions pass before spec freeze — raises the hit rate of the one-shot agent run           |
| [`improvement-loop-plan.md`](./improvement-loop-plan.md)       | After publish: player signals → per-game scorecard → agent-assisted fixes and suggestions              |
| [`path-routing-plan.md`](./path-routing-plan.md)               | ✅ Path URLs for deep links (`/play/<slug>`, …) — History API, no hashbang                             |
| [`risks-and-open-questions.md`](./risks-and-open-questions.md) | Active product blockers, security risks, and resolved architecture decisions                           |
| [`contributing-for-agents.md`](./contributing-for-agents.md)   | How agents run, structure, and contribute to this branch                                               |

## Shared agent playbooks

Kept under `.claude/skills/` so Claude Code auto-loads them, but written to be
**agent-agnostic** — read them whichever agent you are:

| Playbook                                                                    | When it applies                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`verify-agent-work`](../.claude/skills/verify-agent-work/SKILL.md)         | Reviewing, verifying, or merging work you didn't write yourself |
| [`copilot-orchestration`](../.claude/skills/copilot-orchestration/SKILL.md) | Delegating work to GitHub Copilot's remote coding agent         |
| [`game-asset-generation`](../.claude/skills/game-asset-generation/SKILL.md) | Dynamically generating, styling, and composing game assets      |

Both must be **updated when they turn out to be wrong or incomplete** — see the
self-improvement clause at the end of each.

## Status legend

✅ Done / in place &nbsp;&nbsp; 🚧 In progress &nbsp;&nbsp; 📋 Planned / not built &nbsp;&nbsp; ⚠️ Risk or open question

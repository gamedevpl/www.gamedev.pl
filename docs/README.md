# gamedev.pl — Project Documentation

> Documentation set for coding agents (GitHub Copilot, Claude Code, Codex) and humans
> picking up work on the **`the-new-gamedevpl`** branch. Written to be self-contained:
> read these before touching code.

## Elevator pitch

gamedev.pl is pivoting from a static site of hand-built open-source games into a catalog and
creation surface for **AI-assisted games**. A creator submits a spec, a coding agent proposes
real HTML/CSS/JS in a dedicated games repository, and review plus validation gate publication.
Players can later request changes through the same spec-and-PR workflow. The current branch
proves the player surface locally with a deterministic mock; the repository-backed catalog and
submission flow are not built yet. The previous hand-built games site still lives on `master`.

> ⚠️ **`the-new-gamedevpl` is the repository's default branch — deliberately.** This makes
> tools that implicitly target "the default branch" (like assigning a GitHub issue to Copilot's
> coding agent) land here, not on `master`. `master` is frozen, unrelated legacy content:
> **never open a PR against it, and never merge/rebase its history into this branch.**

## Current state of this branch

| Aspect                     | State                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                     | `the-new-gamedevpl`                                                                                                                                |
| Shape                      | npm-workspaces monorepo (`apps/*`, `packages/*`)                                                                                                   |
| Frontend                   | `apps/web` — Vite + React + TypeScript                                                                                                             |
| Backend                    | `apps/api` — Fastify + TypeScript, `POST /api/generate-game`                                                                                       |
| Generator                  | `packages/game-generator` — the seam; deterministic **mock** for now ✅                                                                            |
| Execution model            | ✅ Generated game is assembled into one self-contained HTML doc, run in a **sandboxed iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`) |
| Core loop (Phase 0)        | ✅ Green — `prompt → generated game → play` works locally; full gate (type-check/lint/test/build) passes; verified in-browser                      |
| Game creation              | 📋 **Pivoted** — games will live in a dedicated repo maintained by coding agents; see `games-repo.md`                                              |
| Orchestration / containers | ❌ Removed — self-hosted agent execution was abandoned for legal reasons (see `games-repo.md`)                                                     |
| Deployment (GCP/Terraform) | 📋 Not built — `infra/` is a placeholder                                                                                                           |

> ✅ **Phase 0 is green.** The earlier DSL approach (`@gamedevpl/engine` /
> `@gamedevpl/llm-provider`) has been fully removed and the tree builds clean on the
> `GameProject` (real HTML/JS/CSS) model. The mid-refactor inconsistency is resolved.

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
| [`risks-and-open-questions.md`](./risks-and-open-questions.md) | Active product blockers, security risks, and resolved architecture decisions                           |
| [`contributing-for-agents.md`](./contributing-for-agents.md)   | How agents run, structure, and contribute to this branch                                               |

## Shared agent playbooks

Kept under `.claude/skills/` so Claude Code auto-loads them, but written to be
**agent-agnostic** — read them whichever agent you are:

| Playbook                                                                    | When it applies                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`verify-agent-work`](../.claude/skills/verify-agent-work/SKILL.md)         | Reviewing, verifying, or merging work you didn't write yourself |
| [`copilot-orchestration`](../.claude/skills/copilot-orchestration/SKILL.md) | Delegating work to GitHub Copilot's remote coding agent         |

Both must be **updated when they turn out to be wrong or incomplete** — see the
self-improvement clause at the end of each.

## Status legend

✅ Done / in place &nbsp;&nbsp; 🚧 In progress &nbsp;&nbsp; 📋 Planned / not built &nbsp;&nbsp; ⚠️ Risk or open question

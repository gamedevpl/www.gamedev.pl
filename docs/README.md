# gamedev.pl — Project Documentation

> Documentation set for coding agents (GitHub Copilot, Claude Code, Codex) and humans
> picking up work on the **`the-new-gamedevpl`** branch. Written to be self-contained:
> read these before touching code.

## Elevator pitch

gamedev.pl is pivoting from a static site of hand-built open-source games into a SaaS
for **AI-created games**: a creator describes a game in plain language, an AI agent builds
it as _real_ runnable code, and it is immediately playable in the browser. Players can play
games made by other creators, and — later — request changes while playing that an agent
turns into a pull request against the original creator's repository. The current branch
proves the core slice: **prompt → generated game → play it in a sandboxed iframe**,
running locally with no external services. The previous hand-built games site still lives
on the `master` branch.

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
| Real AI generation         | 📋 Not built (mock only)                                                                                                                           |
| Orchestration / containers | 🚧 First foundation landing — see `container-orchestration.md`                                                                                     |
| Deployment (GCP/Terraform) | 📋 Not built — `infra/` is a placeholder                                                                                                           |

> ✅ **Phase 0 is green.** The earlier DSL approach (`@gamedevpl/engine` /
> `@gamedevpl/llm-provider`) has been fully removed and the tree builds clean on the
> `GameProject` (real HTML/JS/CSS) model. The mid-refactor inconsistency is resolved.

## Documents in this folder

| File                                                           | What's in it                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`vision.md`](./vision.md)                                     | Product vision and the three core loops (create / play / remix)                               |
| [`architecture.md`](./architecture.md)                         | Current MVP architecture + target orchestration architecture, with diagrams                   |
| [`roadmap.md`](./roadmap.md)                                   | Phased milestones with goals, deliverables, dependencies, open questions                      |
| [`security-model.md`](./security-model.md)                     | **Threat model + a live credential-exfiltration finding — read before wiring a real API key** |
| [`agent-adapters.md`](./agent-adapters.md)                     | Making Claude Code / Codex / agy / Copilot interchangeable                                    |
| [`deployment.md`](./deployment.md)                             | Terraform + GCP shape, and securing the GitHub Actions pipeline                               |
| [`container-orchestration.md`](./container-orchestration.md)   | Design for the ephemeral-container agent-runner layer (queue, scale-to-zero, job model)       |
| [`remix-to-pr.md`](./remix-to-pr.md)                           | Spec for the player-remix → pull-request feature                                              |
| [`risks-and-open-questions.md`](./risks-and-open-questions.md) | Living risk log, with two ToS diligence blockers called out at the top                        |
| [`contributing-for-agents.md`](./contributing-for-agents.md)   | How agents run, structure, and contribute to this branch                                      |

## Status legend

✅ Done / in place &nbsp;&nbsp; 🚧 In progress &nbsp;&nbsp; 📋 Planned / not built &nbsp;&nbsp; ⚠️ Risk or open question

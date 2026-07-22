# Copilot / coding-agent instructions

You are working on the **`the-new-gamedevpl`** branch of gamedev.pl — a catalog, sandboxed
player, and spec-submission surface for agent-maintained browser games. Read
[`docs/README.md`](../docs/README.md) first; the `docs/` folder is the **plan of record**. This
file is the short actionable summary.

> ⚠️ **`the-new-gamedevpl` is the repository's default branch — this is deliberate, not an
> accident.** It exists so tools that implicitly work off "the default branch" (including
> assigning a GitHub issue to this Copilot coding agent) land here rather than on `master`.
> **Never open a PR against `master`, and never merge, rebase from, or otherwise pull `master`'s
> history into this branch.** `master` is the previous hand-built games site, frozen in place —
> unrelated to this rewrite. If a PR you're working on shows `master` as its base, that's a bug:
> stop and retarget it to `the-new-gamedevpl` before continuing.

## What this is

- Monorepo, **npm workspaces**: `apps/web` (Vite + React + TS), `apps/api` (Fastify + TS),
  `packages/game-generator` (local preview seam), `infra/` (placeholder), `docs/` (docs).
- The deterministic mock proves the local player loop. Production games are maintained by
  coding agents in a dedicated games repository and published as static bundles; do not replace
  the mock with an in-app agent runtime.

## The one safety rule — do not break it

Generated games run **only** inside an iframe with **`sandbox="allow-scripts"` and no
`allow-same-origin`**. This is the entire reason it is safe to run arbitrary generated code. Do
not add `allow-same-origin`, and never render generated HTML/JS outside the sandboxed iframe.
See [`docs/architecture.md`](../docs/architecture.md#sandboxed-game-execution).

## Conventions

- **ESM only** — every package is `"type": "module"`; use `.js` extensions in relative TS
  imports (e.g. `import { x } from './mock.js'`).
- **TypeScript strict** — `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`. Prefix intentionally-unused args with `_`.
- **Small, focused files**; comment _why_, not _what_.
- **Validate untrusted input** at the API boundary with `zod`. Treat the generator as an
  untrusted seam.
- Prettier formats everything; ESLint runs with **zero warnings allowed**.

## The green gate — must pass before you finish

Run from the repo root:

```bash
npm install
npm run type-check && npm run lint && npm run test && npm run build
```

`npm run dev` runs the API + web together locally (no cloud, no keys; generator defaults to
`mock`). This mirrors CI (`.github/workflows/ci.yml`, Node 20).

## Before larger changes

Read [`docs/roadmap.md`](../docs/roadmap.md) (what's done vs next) and
[`docs/risks-and-open-questions.md`](../docs/risks-and-open-questions.md) (safety invariants and
open questions). Don't resurrect the removed `@gamedevpl/engine` / `@gamedevpl/llm-provider`
DSL — the `GameProject` model is authoritative.

## Current architecture

Production games will live in a **dedicated games repo maintained by coding agents**; this app is becoming a
catalog, player, and spec-submission surface. Self-hosted agent execution was **removed for
legal reasons** and is not a future phase. Read [`games-repo.md`](../docs/games-repo.md) before
making architectural assumptions.

## Deployment status (2026-07-22)

Built and **deployed** (M0–M5 merged). The app (web + API, one same-origin service) is **live on
Cloud Run** at `https://gamedev-app-334141807880.europe-central2.run.app` (project `gamedevpl`);
the live `www.gamedev.pl` Pages site is untouched. The deployed app is **locked behind HTTP Basic
Auth** (temporary). Browse/play is live; **submissions are pending the `github-token` secret** and
return 503 until it exists. Deploy is imperative `gcloud` via `infra/deploy-api.sh` (not Terraform).
Full state and secret table: [`docs/deployment.md`](../docs/deployment.md).

## Reviewing or verifying work you didn't write

If your task involves reviewing, verifying, or merging someone else's changes, read
[`.claude/skills/verify-agent-work/SKILL.md`](../.claude/skills/verify-agent-work/SKILL.md).
Despite the Claude-specific directory, it is agent-agnostic: it covers verifying in an
isolated checkout, what to scrutinise in a diff (scope creep, invariants, supply chain), and
why a CI check that never ran is not a pass.

If it turns out to be wrong or incomplete, update it as part of your change — that file
carries a mandatory self-improvement clause.

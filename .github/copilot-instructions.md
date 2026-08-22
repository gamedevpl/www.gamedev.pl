# Copilot / coding-agent instructions

You are working on the **`master`** branch of gamedev.pl — a catalog, sandboxed
player, and spec-submission surface for agent-maintained browser games. Read
[`docs/README.md`](../docs/README.md) first; the `docs/` folder is the **plan of record**. This
file is the short actionable summary.

> ⚠️ **`master` is the repository's default branch and the live product** — the closed beta at
> `www.gamedev.pl` deploys from it. **Base every PR on `master`.** The rewrite formerly lived
> on a separate `the-new-gamedevpl` branch; that branch has landed on `master` and been
> deleted. Ignore any stale guidance that calls `master` "off-limits" or tells you to retarget
> PRs away from it.

## What this is

- Monorepo, **npm workspaces**: `apps/web` (Vite + React + TS), `apps/api` (Fastify + TS),
  `packages/contract` (shared types), `packages/zone-core`, `infra/` (placeholder), `docs/` (docs).
- The deterministic mock proves the local player loop. Production games are maintained by
  coding agents in a dedicated games repository and published as static bundles; do not replace
  the mock with an in-app agent runtime.

## The one safety rule — do not break it

Generated games run **only** inside an iframe with **`sandbox="allow-scripts allow-pointer-lock"` and no
`allow-same-origin`**. This is the entire reason it is safe to run arbitrary generated code. Do
not add `allow-same-origin`, and never render generated HTML/JS outside the sandboxed iframe.
See [`docs/architecture.md`](../docs/architecture.md#sandboxed-game-execution).

## Conventions

- **ESM only** — every package is `"type": "module"`; use `.js` extensions in relative TS
  imports (e.g. `import { x } from './mock.js'`). Enforced by the
  `gamedev/relative-import-extensions` lint rule, so `npm run lint -- --fix` will write the
  correct specifier for you — including `./dir/index.js` where `./dir` is a directory.
- **TypeScript strict** — `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`. Prefix intentionally-unused args with `_`.
- **Small, focused files**; comments are **one `//` line, ≤12 words, why only** — no
  block essays, no stacked `//` paragraphs. Enforced by `npm run comment-prose` (in
  `npm run lint`); per-file baselines in `eslint-rules/comment-prose-baseline.json` may
  shrink but must not grow. See [`docs/comment-prose-debt.md`](../docs/comment-prose-debt.md).
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

If your change touches anything behind sign-in, actually drive it. Locally,
`curl -X POST http://localhost:5173/api/auth/dev -c cookies.txt` gives a full session
against the in-memory store. Testing the **deployed** site needs a personal access token
(`Authorization: Bearer $GAMEDEV_ACCESS_TOKEN`) — there is no bypass route. Never commit
that token. See [`docs/agent-access-tokens.md`](../docs/agent-access-tokens.md).

To investigate the deployed infrastructure — logs, Cloud Run revisions, error rates — use
`node infra/gcp-read.mjs` rather than `gcloud`, which is not installed in agent sandboxes.
The credential behind it is read-only by construction (no writes, no Firestore, no secret
payloads), so a 403 is a boundary rather than a bug; `node infra/gcp-read.mjs whoami` tells
the two apart. See [`docs/agent-gcp-access.md`](../docs/agent-gcp-access.md).

## Before larger changes

Read [`docs/roadmap.md`](../docs/roadmap.md) (what's done vs next). The risk register
(`risks-and-open-questions.md`) and other internal strategy/legal/ops docs now live in the
**private `www.gamedev.pl-ops` repo, which you cannot access** — if a task seems to hinge
on an open product, legal, or architecture question, flag it in the PR instead of
guessing. Don't resurrect the removed `@gamedevpl/engine` / `@gamedevpl/llm-provider`
DSL — the `GameProject` model is authoritative.

## Current architecture

Production games will live in a **dedicated games repo maintained by coding agents**; this app is becoming a
catalog, player, and spec-submission surface. Self-hosted agent execution was **removed for
legal reasons** and is not a future phase — that finding is about compute we operate on a
seated human subscription, not about hosted builders as a category, so the metered-API
backend in [`managed-agent-backend.md`](../docs/managed-agent-backend.md) does not reopen
it. Read [`games-repo.md`](../docs/games-repo.md) before making architectural assumptions.

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

To hand `/review` desk keep/cut outcomes to a catalog coding agent, read
[`.claude/skills/ingest-desk-reviews/SKILL.md`](../.claude/skills/ingest-desk-reviews/SKILL.md)
(Admin → Assessments → Copy JSON → paste into the agent).

If it turns out to be wrong or incomplete, update it as part of your change — that file
carries a mandatory self-improvement clause.

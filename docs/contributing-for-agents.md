# Contributing — Guide for Coding Agents

For coding agents (GitHub Copilot, Claude Code, Codex) and humans picking up work on the
**`the-new-gamedevpl`** branch. Read [`README.md`](./README.md) and
[`architecture.md`](./architecture.md) first for context.

## Where the current plan lives

- **These docs** (`docs/`) are the plan of record — start here.
- [`roadmap.md`](./roadmap.md) — what's done vs next.
- [`risks-and-open-questions.md`](./risks-and-open-questions.md) — **read the known-issue and
  blocker sections before large changes.**

## Repo layout

```
apps/
  web/       Vite + React + TS frontend (prompt form + game player)
  api/       Fastify + TS backend (POST /api/generate-game, GET /api/health)
packages/
  game-generator/   The generator seam: GameGenerator + GameProject; a mock; templates/
infra/       Placeholder for future Terraform/GCP (nothing used yet)
docs/        This documentation set
```

npm **workspaces**: `workspaces: ["packages/*", "apps/*"]`. Packages build first
(`build:packages`) because apps depend on them.

## How to run things

All commands run from the **repo root**.

| Command              | What it does                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `npm install`        | Install all workspace deps.                                                                 |
| `npm run dev`        | Build packages, then run API + web together (via `concurrently`). Open the printed web URL. |
| `npm run build`      | Build packages, then API, then web.                                                         |
| `npm run test`       | Build packages, then run each workspace's Vitest suite.                                     |
| `npm run lint`       | ESLint over `ts,tsx` — **zero warnings allowed** (`--max-warnings 0`).                      |
| `npm run type-check` | Build packages, then `tsc --noEmit` per workspace.                                          |

Everything runs **locally** — no cloud, no API keys, no secrets. The API defaults to
`127.0.0.1:3001`; the generator defaults to the `mock` provider.

### Definition of "green"

Before finishing a change, all of these must pass from the root:

```bash
npm run type-check && npm run lint && npm run test && npm run build
```

This mirrors the CI workflow (`.github/workflows/ci.yml`, Node 20). A Husky `pre-commit` hook
runs `lint-staged` (Prettier) on staged files.

## Code conventions

- **ESM only.** Every package is `"type": "module"`. Use `.js` extensions in relative imports
  from TS source (e.g. `import { x } from './mock.js'`) — required by the bundler module
  resolution.
- **TypeScript strict.** `tsconfig.base.json` sets `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`. Prefix intentionally-unused args with
  `_`.
- **Small, focused files.** One clear responsibility per file (see how
  `packages/game-generator/src` splits `types` / `mock` / `index`).
- **No unnecessary comments.** Comment _why_, not _what_; let types and names carry the rest.
  Where comments exist in this repo they explain non-obvious safety/design decisions (e.g. why
  the iframe has no `allow-same-origin`) — match that bar.
- **Validate untrusted input** at the API boundary with `zod`. Treat the generator as an
  untrusted seam.
- **Prettier** formats everything; don't hand-format against it.

## The one safety rule you must not break

Generated games run **only** inside a sandboxed iframe with `sandbox="allow-scripts"` and
**no `allow-same-origin`**. This is the entire reason it's safe to run arbitrary generated
code. Do not add `allow-same-origin`, and do not render generated HTML/JS outside the iframe.
See [`architecture.md`](./architecture.md#sandboxed-iframe-execution-model).

## Prior art: agent instructions on `master`

The `master` branch's hand-built games use per-project agent-instruction files as prior art —
e.g. `games/hungry-lion/GENAICODE_INSTRUCTIONS.md`. If you introduce a similar per-package
instruction file for agents on this branch, follow that pattern (concise, project-scoped,
actionable). This repo is developed with [Genaicode](https://github.com/gtanczyk/genaicode);
see `genaicode.config.ts` (its `lintCommand` is `npm run type-check && npm run lint`).

## When you hit the mid-refactor

If you encounter imports of `@gamedevpl/engine` or `@gamedevpl/llm-provider`, those belong to a
removed DSL approach. **Migrate to the `GameProject` (HTML/JS/CSS) model** in
`packages/game-generator/src/types.ts` — don't resurrect the DSL. See the known-issue section
in [`risks-and-open-questions.md`](./risks-and-open-questions.md#known-issue-mid-refactor-inconsistency).

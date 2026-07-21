# Copilot / coding-agent instructions

You are working on the **`the-new-gamedevpl`** branch of gamedev.pl — a SaaS that turns a
natural-language prompt into a playable browser game. Read [`docs/README.md`](../docs/README.md)
first; the `docs/` folder is the **plan of record**. This file is the short actionable summary.

## What this is

- Monorepo, **npm workspaces**: `apps/web` (Vite + React + TS), `apps/api` (Fastify + TS),
  `packages/game-generator` (the generator seam), `containers/` (container-based agent runner),
  `infra/` (placeholder), `docs/` (docs).
- The generator turns a prompt into a **`GameProject`** — real, unconstrained `html`/`js`/`css`,
  not a schema document. Today a deterministic **mock** drives it offline; a containerized real
  agent replaces it later. Depend only on the `GameGenerator` interface in
  `packages/game-generator/src/types.ts`.

## The one safety rule — do not break it

Generated games run **only** inside an iframe with **`sandbox="allow-scripts"` and no
`allow-same-origin`**. This is the entire reason it is safe to run arbitrary generated code. Do
not add `allow-same-origin`, and never render generated HTML/JS outside the sandboxed iframe.
See [`docs/architecture.md`](../docs/architecture.md#sandboxed-iframe-execution-model).

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

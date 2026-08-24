# Contributing — Guide for Coding Agents

For coding agents (GitHub Copilot, Claude Code, Codex) and humans picking up work on
**`master`** — the repository's default branch and the live product. Read
[`README.md`](./README.md) and [`architecture.md`](./architecture.md) first for context.

> ℹ️ **History:** the rewrite was built on a separate `the-new-gamedevpl` branch, deliberately
> kept as the default so tools that implicitly target "the default branch" (e.g. assigning a
> GitHub issue to Copilot's coding agent) landed there rather than on the old hand-built site
> that lived on `master`. That branch has since landed on `master` and been deleted — target
> every PR at `master`, and ignore any stale guidance calling `master` "off-limits"; the old
> site survives only in early history. One lesson from that era still applies: forking from
> the wrong base produces junk — an early Copilot task forked from the old `master` and opened
> a PR that duplicated `apps/api` from scratch instead of building on the real one (closed as
> PR #206).

## Where the current plan lives

- **These docs** (`docs/`) are the plan of record — start here.
- [`roadmap.md`](./roadmap.md) — what's done vs next.
- [`risks-and-open-questions.md`](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/risks-and-open-questions.md) — **read the known-issue
  and blocker sections before large changes.** Lives in the private `www.gamedev.pl-ops`
  repo, as do the other strategy/legal/ops docs — see
  [`internal-ops-repo`](../.claude/skills/internal-ops-repo/SKILL.md).

## Repo layout

```
apps/
  web/       Vite + React + TS frontend (prompt form + game player)
  api/       Fastify + TS backend (catalog, jobs, agent channel, MCP)
  world/     Zone host (authoritative sims)
packages/
  contract/    Types, constants and route tables shared across workspaces
  zone-core/   Zone tickets, schema, deterministic cage
infra/       Non-deployable placeholder until hosting is selected
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
`127.0.0.1:3001` and serves repo fixtures from an in-memory store.

### Definition of "green"

Before finishing a change, all of these must pass from the root:

```bash
npm run type-check && npm run lint && npm run test && npm run build
```

This mirrors the CI workflow (`.github/workflows/ci.yml`, Node 20). A Husky `pre-commit` hook
runs `lint-staged` (Prettier) on staged files.

### Exercising the authenticated half of the product

A green gate says the code compiles and its tests pass. It does not say the flow works. If
your change touches anything behind sign-in — creating, revising, notifications, votes,
party mode — drive it.

**Locally (the default, and what most changes need).** `npm run dev`, then:

```bash
curl -X POST http://localhost:5173/api/auth/dev -c cookies.txt
```

That is a full session for `dev:local` against the in-memory store and repo fixtures.
No credentials, nothing real touched. See [`local-development.md`](./local-development.md).

**Against the deployed site**, when the thing under test is production behaviour — real
Firestore, the real beta walls, the real CDN — you need a personal access token, because
you have no browser and no Google account and there is no bypass route:

```bash
curl -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" https://www.gamedev.pl/api/auth/me
# driving a real browser? exchange it for the cookie the SPA actually sends:
curl -si -X POST https://www.gamedev.pl/api/auth/session \
  -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" | grep -i set-cookie
```

Tokens are issued by the repo owner, never self-served, and `GAMEDEV_ACCESS_TOKEN` must
never be committed or pasted into a game, an issue, or a PR description. Full guide:
[`agent-access-tokens.md`](./agent-access-tokens.md).

## Code conventions

- **ESM only.** Every package is `"type": "module"`. Use `.js` extensions in relative imports
  from TS source (e.g. `import { x } from './mock.js'`) — required by the bundler module
  resolution.
- **TypeScript strict.** `tsconfig.base.json` sets `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`. Prefix intentionally-unused args with
  `_`.
- **Small, focused files.** One clear responsibility per file (see how
  `packages/contract/src` gives each vocabulary its own module).
- **Comments are one-liners only — no prose.** A comment is a `//` line of at most **12
  words**, saying _why_, never narrating _what_. Forbidden: multi-line `/* */` / `/** */`
  blocks, stacked `//` paragraphs, and essay headers. If the knowledge matters beyond one
  line, put it in `docs/` or a skill — not above the function. `npm run comment-prose` (also
  part of `npm run lint`) freezes each file's prose-comment word count in
  `eslint-rules/comment-prose-baseline.json`; new files start at 0. When you touch a file
  that still carries debt, shrink it and run `npm run comment-prose -- --write`. See
  [`comment-prose-debt.md`](./comment-prose-debt.md). Safety comments that stay (e.g. why the
  iframe has no `allow-same-origin`) must still fit the one-liner bar.
- **Validate untrusted input** at the API boundary with `zod`. Treat the generator as an
  untrusted seam.
- **Prettier** formats everything; don't hand-format against it.

## The one safety rule you must not break

Generated games run **only** inside a sandboxed iframe with `sandbox="allow-scripts allow-pointer-lock"` and
**no `allow-same-origin`**. This is the entire reason it's safe to run arbitrary generated
code. Do not add `allow-same-origin`, and do not render generated HTML/JS outside the iframe.
See [`architecture.md`](./architecture.md#sandboxed-game-execution).

## Prior art: agent instructions on `master`

The `master` branch's hand-built games use per-project agent-instruction files as prior art —
e.g. `games/hungry-lion/GENAICODE_INSTRUCTIONS.md`. If you introduce a similar per-package
instruction file for agents on this branch, follow that pattern (concise, project-scoped,
actionable). This repo is developed with [Genaicode](https://github.com/gtanczyk/genaicode);
see `genaicode.config.ts` (its `lintCommand` is `npm run type-check && npm run lint`).

**Two different things share the name.** `genaicode.config.ts` configures the legacy **1.x
coding agent** (`npx genaicode@1`). **GenAIcode 2.x is a backend LLM toolkit**, not an agent,
and is a runtime dependency of `@gamedevpl/api`: every Vertex AI call goes through
[`apps/api/src/platform/genai.ts`](../apps/api/src/platform/genai.ts). Add LLM call sites there rather than
hand-rolling `GoogleAuth` + REST against `*-aiplatform.googleapis.com`.

## Removed approaches

If you encounter imports of `@gamedevpl/engine` or `@gamedevpl/llm-provider`, those belong to a
removed DSL approach. **Migrate to the `GameProject` (HTML/JS/CSS) model** in
`packages/contract/src/game-project.ts` — don't resurrect the DSL. Likewise, do not restore the
removed container runner, auth proxy, job queue, or in-app agent execution path; production
games belong in the dedicated games repository described in [`games-repo.md`](./games-repo.md).

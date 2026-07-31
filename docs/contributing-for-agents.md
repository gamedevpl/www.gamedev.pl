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
  api/       Fastify + TS backend (POST /api/generate-game, GET /api/health)
packages/
  game-generator/   The generator seam: GameGenerator + GameProject; a mock; templates/
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
`127.0.0.1:3001`; the generator defaults to the `mock` provider.

### Definition of "green"

Before finishing a change, all of these must pass from the root:

```bash
npm run type-check && npm run lint && npm run test && npm run build
```

This mirrors the CI workflow (`.github/workflows/ci.yml`, Node 20). A Husky `pre-commit` hook
runs `lint-staged` (Prettier) on staged files.

### Anything visual ships with pictures

**A pull request that changes layout, styling or any on-screen control must show it** — a
screenshot per meaningful state, and an animated GIF when the change is a motion or an
interaction. A green test run proves the code does what the test says; it says nothing about
whether the thing looks right, and a reviewer should not have to check out a branch and run
`npm run dev` to find out.

Capture from the **running app**, not from a mockup — a mockup can be wrong in exactly the way
the review is meant to catch. Drive it with Playwright against `npm run dev` and commit the
files under `docs/media/<feature>/`, then reference them from the PR body with
`![...](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/docs/media/...)`. The repo is
public, so those URLs render in the PR.

Practical notes, learned the hard way:

- **Measure the crop in the same browser session that records**, not a separate one. A
  bounding box from another page load belongs to another scroll position.
- **The site header is sticky.** Scrolling an element to `top` parks it _underneath_ the
  header; subtract the header's height plus a margin, or the recording shows the header.
- Playwright's bundled ffmpeg (`/opt/pw-browsers/ffmpeg-*/ffmpeg-linux`) has **no GIF muxer
  and almost no filters**. Extract PNG frames with `-f image2 -c:v png` and encode the GIF in
  JS (`pngjs` + `gifenc`), cropping in the encoder. Quantize **once** for the whole clip — a
  per-frame palette makes the dark background shimmer.

### Exercising the authenticated half of the product

A green gate says the code compiles and its tests pass. It does not say the flow works. If
your change touches anything behind sign-in — creating, revising, notifications, votes,
party mode — drive it.

**Locally (the default, and what most changes need).** `npm run dev`, then:

```bash
curl -X POST http://localhost:5173/api/auth/dev -c cookies.txt
```

That is a full session for `dev:local` against the in-memory store and the mock generator.
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
  `packages/game-generator/src` splits `types` / `mock` / `index`).
- **No unnecessary comments.** Comment _why_, not _what_; let types and names carry the rest.
  Where comments exist in this repo they explain non-obvious safety/design decisions (e.g. why
  the iframe has no `allow-same-origin`) — match that bar.
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
[`apps/api/src/genai.ts`](../apps/api/src/genai.ts). Add LLM call sites there rather than
hand-rolling `GoogleAuth` + REST against `*-aiplatform.googleapis.com`.

## Removed approaches

If you encounter imports of `@gamedevpl/engine` or `@gamedevpl/llm-provider`, those belong to a
removed DSL approach. **Migrate to the `GameProject` (HTML/JS/CSS) model** in
`packages/game-generator/src/types.ts` — don't resurrect the DSL. Likewise, do not restore the
removed container runner, auth proxy, job queue, or in-app agent execution path; production
games belong in the dedicated games repository described in [`games-repo.md`](./games-repo.md).

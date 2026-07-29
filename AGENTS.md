# AGENTS.md

Guidance for coding agents (Codex, Claude Code, "agy", and others) working in this repo.
GitHub Copilot has an equivalent file at [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

**The `docs/` folder is the plan of record — read [`docs/README.md`](docs/README.md) first.**
Then [`docs/contributing-for-agents.md`](docs/contributing-for-agents.md) for the full guide.

## Fast facts

- npm-workspaces monorepo: `apps/web`, `apps/api`, `packages/game-generator`, `infra/`, `docs/`.
- Branch: `master` — **the repo's default branch and the live product.** The closed beta at
  `https://www.gamedev.pl` deploys from it. Product: a catalog, sandboxed player, and
  spec-submission surface for an agent-maintained games repo.
- Target every PR at `master`. The rewrite formerly lived on the `the-new-gamedevpl` branch;
  that branch has landed on `master` and been deleted, so ignore any stale guidance that calls
  `master` "off-limits" — the previous hand-built games site survives only in early history.
- **Safety invariant (never break):** generated games render only in an iframe with
  `sandbox="allow-scripts allow-pointer-lock"` and **no `allow-same-origin`**.
- **ESM only**, TypeScript strict, `.js` extensions in relative imports, Prettier + ESLint
  (zero warnings).

## Green gate — run before finishing any change

```bash
npm install
npm run type-check && npm run lint && npm run test && npm run build
```

`npm run dev` runs everything locally; the generator defaults to the offline `mock` provider,
so no cloud or API keys are needed.

**Testing behind sign-in.** Locally, `curl -X POST http://localhost:5173/api/auth/dev -c
cookies.txt` gives you a full session — no credentials, in-memory store, nothing real
touched. To exercise the **deployed** site you need a personal access token
(`Authorization: Bearer $GAMEDEV_ACCESS_TOKEN`), because there is no bypass route and never
will be; exchange it at `POST /api/auth/session` for the cookie the SPA sends if you're
driving a browser. Tokens are issued by the repo owner and must never be committed. See
[`docs/agent-access-tokens.md`](docs/agent-access-tokens.md).

## Current architecture

Production games will live in a **dedicated games repo maintained by coding agents**; this app
is becoming a catalog, player, and spec-submission surface. Self-hosted agent execution (the
agent-runner container, auth proxy, job tokens, and orchestrator) was **removed for legal
reasons** and is not a future phase. Read
[`games-repo.md`](docs/games-repo.md) before making architectural assumptions.

## Deployment status (2026-07-22)

The steel thread is **built and deployed** — all milestones M0–M5 merged. The app (web + API,
one same-origin service) is **live on Cloud Run** at
`https://gamedev-app-334141807880.europe-central2.run.app` (GCP project `gamedevpl`); the live
`www.gamedev.pl` GitHub Pages site is untouched.

- **The deployed app is locked behind HTTP Basic Auth** (`site-basic-auth` secret) — a
  temporary "not public yet" gate. Browse/play is live and verified in production.
- **Submissions are pending one owner secret** (`github-token`, a games-repo-scoped PAT); until
  it exists, submission routes return 503 by design.
- **M4 auto-assign requires the `COPILOT_ASSIGN_TOKEN` PAT** on the games repo — the default
  Actions `GITHUB_TOKEN` cannot assign the Copilot bot (empirically verified).
- Deploy via [`infra/deploy-api.sh`](infra/deploy-api.sh) (imperative `gcloud`, **not**
  Terraform — the `infra/*.tf` files are an intentional no-op placeholder). Full deploy state,
  the secret table, and how to enable submissions / remove the lock are in
  [`docs/deployment.md`](docs/deployment.md).

## Shared playbooks (read these — they apply to you too)

These live under `.claude/skills/` because that path makes them auto-loadable for Claude Code,
but **the content is agent-agnostic** and is the project's record of how to work with
autonomous agents here. Read them directly:

| Playbook                                                                                                   | When it applies                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`.claude/skills/verify-agent-work/SKILL.md`](.claude/skills/verify-agent-work/SKILL.md)                   | **Any time you review, verify, or merge work you didn't write** — from Copilot, another agent, or a subagent. Covers verifying in a throwaway clone, what to check in a diff, and why a passing-looking CI check may be no signal at all. |
| [`.claude/skills/copilot-orchestration/SKILL.md`](.claude/skills/copilot-orchestration/SKILL.md)           | When **delegating** work to GitHub Copilot's remote coding agent — dispatch mechanics, which tasks are worth delegating, and the traps (default-branch forking, `action_required` CI).                                                    |
| [`.claude/skills/game-asset-generation/SKILL.md`](.claude/skills/game-asset-generation/SKILL.md)           | When **generating, styling, or composing game assets** (sprites, audio, UI) for any game specification using modern procedural and tool-assisted workflows.                                                                               |
| [`.claude/skills/managing-beta-participants/SKILL.md`](.claude/skills/managing-beta-participants/SKILL.md) | When **managing closed beta participants**, approving waitlisted users, pre-approving emails/UIDs, or inspecting beta access controls.                                                                                                    |
| [`.claude/skills/product-instrumentation/SKILL.md`](.claude/skills/product-instrumentation/SKILL.md)       | When **adding or changing any user-facing flow** (play, creation, sign-in, sharing, party mode) or touching telemetry/metrics code — the measurement contract, privacy invariants, event vocabulary, and the current gap list.            |

Both carry a **mandatory self-improvement clause**: if you use one and it turns out to be
wrong, stale, or missing something that cost you time, update it in the same session. That
applies regardless of which agent you are.

## Cursor Cloud specific instructions

Setup is just `npm install` (see the "Green gate" and `docs/contributing-for-agents.md` for the
standard commands). Everything runs offline with the `mock` generator — no cloud, keys, or
secrets. Non-obvious caveats for running/testing locally:

- **Open the web app at `http://localhost:5173`, not `http://127.0.0.1:5173`.** `npm run dev`
  (Vite) binds to `localhost` (IPv6 `::1`) only, so `127.0.0.1` refuses the connection. The API
  is at `127.0.0.1:3001`; Vite proxies `/api` → the API (`apps/web/vite.config.ts`).
- **`GET /api/catalog` returns 503 ("catalog is not configured") locally, and the home page
  shows a red "Could not load the catalog" error — this is expected.** The catalog is served
  from the separate games repo, which isn't wired up in local dev.
- **The generate/create loop is gated behind Google sign-in in the UI** — clicking "Build My
  Game" opens a "Sign in with Google" modal, and `POST /api/generate-game` returns 401 without a
  session. Real Google OAuth isn't available locally. To exercise the authenticated
  generate→assemble loop without Google, do what the tests do: `InMemoryStore.upsertUser(...)` +
  `mintSessionToken(uid, 'dev-session-secret-change-me')` and send it as the `gamedev_session`
  cookie (see `apps/api/src/app.test.ts`). Dev uses `InMemoryStore` and that default session
  secret (`apps/api/src/server.ts`, `auth.ts`).
- Generated games render only in `<iframe sandbox="allow-scripts allow-pointer-lock">` with no `allow-same-origin`
  (`apps/web/src/GameFrame.tsx`) — the safety invariant. A produced game document is a
  self-contained `<!doctype html>` with inlined `<style>`/`<script>`.

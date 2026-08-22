# AGENTS.md

Guidance for coding agents (Codex, Claude Code, "agy", and others) working in this repo.
GitHub Copilot has an equivalent file at [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

**The `docs/` folder is the plan of record — read [`docs/README.md`](docs/README.md) first.**
Then [`docs/contributing-for-agents.md`](docs/contributing-for-agents.md) for the full guide.

## Fast facts

- npm-workspaces monorepo: `apps/web`, `apps/api`, `apps/world`, `packages/contract`, `packages/zone-core`, `infra/`, `docs/`.
- **This repo is public.** Internal docs (GTM strategy, risk register, legal analysis, store
  accounts, mobile/store launch plans, ops readiness, creator-experience review) live in the **private
  [`www.gamedev.pl-ops`](https://github.com/gamedevpl/www.gamedev.pl-ops) repo — required
  context for planning/strategy/legal/ops work. Read
  [`.claude/skills/internal-ops-repo/SKILL.md`](.claude/skills/internal-ops-repo/SKILL.md)
  for what's there, when you must consult it, and the leak-hygiene rules (never copy its
  content into this repo, public issues, or PRs).
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

**Investigating prod.** You can read logs, metrics, Cloud Run state and build history
yourself — don't guess at an outage or ask the owner to paste logs. `gcloud` is not installed
in agent sandboxes, so use `node infra/gcp-read.mjs` (`whoami`, `logs`, `services`,
`revisions`, `describe`, `raw`), which hits the GCP REST APIs with a credential that is
**read-only by construction**: no writes anywhere, no Firestore, no secret payloads, no
backup bucket. A 403 is therefore a boundary, not a bug — run `whoami` to tell the two apart,
and escalate rather than route around it. See
[`docs/agent-gcp-access.md`](docs/agent-gcp-access.md) and the incident procedures in
[`docs/runbooks/`](docs/runbooks/README.md).

## Layout changes: check the states that coexist with the one you built

A green suite says nothing about layout. jsdom runs no media queries and does no layout, so
every CSS decision in this repo is held by someone looking at it in a browser — which means
looking at the _right_ screen, not just the one you were working on.

The trap is that you verify the state you built and miss the states that share the screen
with it. A studio thread was checked at six widths and looked right at all of them; it was
still broken, because a bottom-anchored install/update banner sat on the composer, and the
shell that pinned the composer to the bottom edge had also removed the page scroll that used
to let a reader escape from under it. Nothing about that is visible on a screen with no
banner.

So when you change layout, before you call it done, put the other states on screen:

- **Bottom-anchored overlays** — `.install-prompt`, `.app-update`. Both are `position: fixed`
  at `z-index: 900` and appear on conditions you will not hit by accident.
- **The on-screen keyboard**, which halves the viewport on a phone and is what `100dvh`
  behaves differently under.
- **Sheets, modals, and the details rail**, which change what "the bottom of the screen"
  means.
- **The longest real string you have**, in Polish as well as English — Polish runs longer,
  and a box sized to English clips it.

Forcing a state that needs an event you cannot trigger (an install prompt, a waiting service
worker) is legitimate: inject an element with the same class and measure against it. That is
what the CSS contract actually promises.

### Do not write the same shell twice

The follow-up to that bug reintroduced it. The phone rules were correct and a second block
was written for desktop, re-deriving the same shell from scratch — and it left out the two
rules that only matter in states you cannot see: the transcript's own scroller, and the
bottom bars joining the column. Both blocks were "checked"; both checks were of the state
that was on screen.

When one shape holds across widths, write it **once, outside every media query**, and let the
media blocks carry only what genuinely differs. A rule that must never be forgotten cannot
live in a place where it has to be remembered twice. The same applies to the test: a guard
pinned to a single viewport stops guarding the moment the layout gains a second one, so cover
each band the CSS assembles differently — see `apps/e2e/src/studio-shell.test.ts`
(that gate stubs the shelf/status JSON so an empty `bot:e2e` shelf cannot skip the check).

## Current architecture

Production games will live in a **dedicated games repo maintained by coding agents**; this app
is becoming a catalog, player, and spec-submission surface. Self-hosted agent execution (the
agent-runner container, auth proxy, job tokens, and orchestrator) was **removed for legal
reasons** and is not a future phase. That finding is about compute **we** operate on a
seated human subscription — a builder on a hosted platform paid by metered API key is a
different thing and is being built (see
[`managed-agent-backend.md`](docs/managed-agent-backend.md)). Read
[`games-repo.md`](docs/games-repo.md) before making architectural assumptions.

## Deployment status (2026-07-30)

The steel thread is **built and deployed** — all milestones M0–M5 merged. The app (web + API,
one same-origin service) is **live on Cloud Run in `europe-west1`** (GCP project `gamedevpl`)
and serves **`https://www.gamedev.pl`** through a native domain mapping. It is no longer a
GitHub Pages site — the domain _is_ the app.

Firestore lives in `europe-central2`, which is why backup and scheduler commands use a
different region from deploy commands. That split is deliberate, not a typo.

- **Access is gated by Google/Apple sign-in plus a closed-beta allowlist**, not by HTTP Basic
  Auth. The old `site-basic-auth` gate is gone: no code reads `SITE_BASIC_AUTH`, and the
  secret is mapped into none of the three Cloud Run services. Browse/play is live and
  verified in production.
- **Submissions work.** `github-token` exists in Secret Manager; the 503-by-design behaviour
  described here previously applied only before that secret was created.
- **Nothing dispatches through GitHub any more.** A job is handed straight to an agent and a
  revision is a new task on its workspace, so the games repo's `assign-copilot` and
  `relay-creator-feedback` workflows — and the `COPILOT_ASSIGN_TOKEN` PAT they needed — were
  deleted on 2026-07-30.
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
| [`.claude/skills/byoca-mcp/SKILL.md`](.claude/skills/byoca-mcp/SKILL.md)                                   | When **adding or changing MCP / self-build** tools, the agent channel, Studio connect/status for self rounds, or builder handoff — session loop, `end` / `call_end`, quiet fallback.                                                      |
| [`.claude/skills/copilot-orchestration/SKILL.md`](.claude/skills/copilot-orchestration/SKILL.md)           | When **delegating** work to GitHub Copilot's remote coding agent — dispatch mechanics, which tasks are worth delegating, and the traps (default-branch forking, `action_required` CI).                                                    |
| [`.claude/skills/game-asset-generation/SKILL.md`](.claude/skills/game-asset-generation/SKILL.md)           | When **generating, styling, or composing game assets** (sprites, audio, UI) for any game specification using modern procedural and tool-assisted workflows.                                                                               |
| [`.claude/skills/managing-beta-participants/SKILL.md`](.claude/skills/managing-beta-participants/SKILL.md) | When **managing closed beta participants**, approving waitlisted users, pre-approving emails/UIDs, or inspecting beta access controls.                                                                                                    |
| [`.claude/skills/product-instrumentation/SKILL.md`](.claude/skills/product-instrumentation/SKILL.md)       | When **adding or changing any user-facing flow** (play, creation, sign-in, sharing, party mode) or touching telemetry/metrics code — the measurement contract, privacy invariants, event vocabulary, and the current gap list.            |
| [`.claude/skills/ingest-desk-reviews/SKILL.md`](.claude/skills/ingest-desk-reviews/SKILL.md)               | When **copying `/review` desk outcomes** (Admin → Assessments → Copy JSON) and turning keep/cut/checklist signal into a catalog improvement plan for coding agents.                                                                       |
| [`.claude/skills/internal-ops-repo/SKILL.md`](.claude/skills/internal-ops-repo/SKILL.md)                   | When work touches **planning, launch stages, legal/compliance, store submission, ops gates, or product risks** — those docs live in the private `www.gamedev.pl-ops` repo, not here. Also the rules against leaking its content.          |

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
  Game" opens a "Sign in with Google" modal, and the creation routes return 401 without a
  session. Real Google OAuth isn't available locally. To exercise the authenticated
  generate→assemble loop without Google, do what the tests do: `InMemoryStore.upsertUser(...)` +
  `mintSessionToken(uid, 'dev-session-secret-change-me')` and send it as the `gamedev_session`
  cookie (see `apps/api/src/app.test.ts`). Dev uses `InMemoryStore` and that default session
  secret (`apps/api/src/server.ts`, `auth.ts`).
- Generated games render only in `<iframe sandbox="allow-scripts allow-pointer-lock">` with no `allow-same-origin`
  (`apps/web/src/GameFrame.tsx`) — the safety invariant. A produced game document is a
  self-contained `<!doctype html>` with inlined `<style>`/`<script>`.

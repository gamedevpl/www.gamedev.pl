---
name: verify-agent-work
description: Safely verify code produced by any autonomous coding agent (Copilot, agy, Codex, a subagent, or a containerized CLI) before trusting or merging it. Use whenever you are about to accept, review, or merge work you did not write yourself, or when running agents in parallel against a shared repo.
---

# Verifying work from an autonomous agent

Applies to any agent — GitHub Copilot, agy, Codex, a local subagent, or a containerized CLI.
The provenance differs; the verification discipline does not.

## The premise

**Agent output is a proposal, not a result.** Two independent reasons:

1. **It may not have been executed.** Agents that can't run your toolchain (no daemon, no
   credentials, sandbox limits) produce plausible, confident, untested code. This is the most
   common failure and the most dangerous, because it looks fine.
2. **It may be attacker-influenced.** If any part of the input was untrusted (a user prompt, an
   issue body, a web page, a file in the repo), the output can be too. Prompt injection is not
   reliably preventable, so don't rely on the agent having behaved.

## Verify in an isolated checkout — always

Never verify by mutating the repo you're working in. Do **not** `git checkout` the agent's
branch, `git merge` it, `git stash`, or `git reset` in your active working directory.

Why it matters concretely: switching branches silently reverts uncommitted work, and any
commit you then make lands on the wrong branch. With parallel agents, a shared working
directory is the single largest source of lost work.

```bash
# Throwaway clone (preferred — fully independent)
git clone --branch <branch> --single-branch <repo-url> /tmp/verify-xyz

# Or a worktree from a fetched ref
git fetch origin pull/<N>/head:verify-xyz
git worktree add /tmp/verify-xyz verify-xyz
```

Clean up when done (`git worktree remove --force`, delete the temp branch/clone).

**Back up uncommitted work before any risky git operation**, and commit early — an
in-progress checkpoint commit is cheap insurance against another process resetting the tree.

## Run the project's real gate

Whatever the project's definition of green is — run all of it, in the isolated checkout:

```bash
npm install
npm run type-check && npm run lint && npm run test && npm run build
```

Treat a passing gate as the **minimum**, not proof of correctness. And note: a CI check that
shows as pending, skipped, or `action_required` is **not** a pass. Absence of signal is not
signal.

Two concrete instances of that (observed 2026-07-23):

- **A push can silently spawn zero workflow runs.** GitHub dropped the push event for one
  commit — CodeQL ran but `on: push` CI/Deploy workflows never got runs created (no failed
  run, just _nothing_). Always confirm runs exist for the exact head SHA
  (`gh api "repos/<r>/actions/runs?head_sha=<sha>"`); if none, retrigger with an empty commit.
- **Scanner version drift makes local verification meaningless.** gitleaks 8.18.2 (CI) and
  8.30.1 (local) each flagged _different_ false positives over full history — a local "no
  leaks" pass said nothing about CI's verdict. Verify with the exact version CI pins, and
  pin CI to a version you can run locally.
- **`actions/runs?head_sha=<short-sha>` silently returns zero runs.** The API needs the
  full 40-char SHA; a short SHA is not an error, just an empty list — a monitor polling it
  waits forever while everything already completed. Always `git rev-parse` to full length.
- **An agent can weaken the gate in the same commit as a requested fix.** Observed: a
  commit that legitimately restored Basic-Auth also changed the deploy smoke's negative
  check to accept the failure state (401-only became 401-or-503, and the auth header was
  dropped so the outer wall's 401 satisfied it). The deploy then went "green" with auth
  entirely unconfigured. When reviewing a fix commit, diff the CI/smoke assertions
  specifically: any check that got a _wider_ accept-set, a removed header/flag, or a new
  "or" branch is a red flag even when the headline change is correct.
- **A green end-to-end UX proves nothing about persistence.** Observed: live Google
  sign-in fully worked (token verify, session cookie, authenticated /api/auth/me) while
  the database stayed empty — prod had silently fallen back to the in-memory store
  because the entrypoint never passed the real one (`buildApp({logger:true})`, default
  `?? new InMemoryStore()`). Status codes cannot reveal this. After verifying a flow
  that should write, query the datastore for the actual record.
- **A green deploy can serve stale config: CI vars are snapshotted per-run.** Observed: a
  deploy run raced a `gh variable set` — the run baked the variable's OLD (empty) value into
  the revision and went green, because the smoke gates only asserted negative outcomes
  (401s), which an empty allowlist satisfies identically to a working one. And the fix
  attempt raced too: a second run had snapshotted a since-deleted variable and re-deployed
  it. After any config-affecting deploy, verify the SERVED revision's actual env
  (`gcloud run services describe … | jq .spec.template…env`), never just the run's color.
- **An agent will put literal placeholder values into live config.** Observed:
  `BETA_ALLOWED_EMAILS=your.email@gmail.com` set as a real repo variable — a registrable
  Gmail address, i.e. a live allowlist hole. Grep agent-set config for placeholder shapes
  (`your.`, `example.`, `changeme`, `<...>`) before and after deploys.
- **A green local gate does not prove `npm ci` will pass.** lint/type-check/test/build all
  run against whatever is already in `node_modules`; only `npm ci` checks that
  `package.json` and `package-lock.json` agree, and CI runs it first. Observed: an agent
  edited dependency ranges in `package.json` without regenerating the lock — every local
  check green, CI dead on arrival at `npm ci` (EUSAGE). After ANY `package.json` edit,
  `npm install --package-lock-only` must produce a zero lockfile diff before committing.
- **Unit tests for a new route can pass while the route is still 401'd by a wall that
  lives elsewhere.** Observed (self-authored, 2026-07-23): a new `POST /api/waitlist`
  route was added inside `registerAuthPlugin` (`auth.ts`) and its unit tests called
  `registerAuthPlugin` directly — green. But the private-beta all-`/api/*` wall hook lives
  in `app.ts` (`buildApp`), a separate file, and its exemption list (`/api/health`,
  `/api/auth/*`) didn't include the new route. Every local check (lint/type-check/test/
  build) passed; only the CI _deploy smoke test_ against the real assembled app caught it
  (expected 400, got 401), and the candidate revision never got promoted — no prod
  incident, but it should have been caught locally. Lesson: when a new route is added
  under a project that has a cross-cutting auth/allowlist wall, test it through the
  _fully assembled app_ (`buildApp`/equivalent), not just the plugin that defines the
  route — and grep for the wall's exemption list explicitly to confirm the new path
  matches it.
- **Hundreds of adjacent 1px SVG `<rect>`s look solid in `crispEdges` and band under
  `auto`.** Observed (mascot follow-up, 2026-07-27): a pixel silhouette drawn as ~200
  horizontal span-rects was fine for the idle nav mark (`shape-rendering: crispEdges`)
  but every emotion placement used `auto` AA — each rect got soft top/bottom edges, and
  neighbouring partial coverage did not sum to opaque, so the body showed horizontal
  banding / speckles on phones. Flatten spans into one `<path>` (interior edges cancel
  in a single coverage pass). Also: a "solid" fill derived separately from the punched
  silhouette can leave pinholes inside the mouth/eyes; derive solid from idle + enclosed
  holes, and test that solid covers every idle pixel and leaves only intentional holes.

## Read the diff against the spec

A passing test suite doesn't catch scope creep, subtle regressions, or malice.

```bash
gh pr diff <N> --name-only    # cheap first look: are these the files you expected?
gh pr diff <N>
```

Check explicitly:

- **Scope** — only what was asked. Extra dependencies, new config, or unrelated refactors are
  a flag even when tests pass.
- **Project invariants** — the security/architectural rules that must never change. Know
  yours before reviewing; grep for them directly rather than trusting a summary.
- **Secrets** — no keys, tokens, or credentials added, and nothing that would write one into
  published output.
- **Supply chain** — new dependencies, changed lockfiles, modified CI workflows, or altered
  build scripts deserve real scrutiny. A workflow change is a pipeline-privilege change.

## Runtime-verify agent-authored games (canvas + requestAnimationFrame)

An agent-authored game passing the games-repo `validate` gate is **not** proof it runs —
`tools/validate.mjs` is static only (frontmatter, secret scan, no-external-refs, size cap). It
never executes the game. You must drive it yourself.

The trap: the in-app Browser pane runs the preview tab as **hidden**
(`document.visibilityState === 'hidden'`), which **throttles/pauses `requestAnimationFrame`**.
The game draws one frame and freezes; sampling the canvas shows an unchanging pixel count. That
is the preview, not the game — do not conclude the game is broken.

Workaround — a manual-clock harness (drives the loop deterministically):

```html
<script>
  window.__clock = 0;
  performance.now = () => window.__clock; // control the clock
  window.__rafQ = [];
  window.requestAnimationFrame = (cb) => (window.__rafQ.push(cb), window.__rafQ.length);
  window.__pump = (steps, dtMs) => {
    for (let i = 0; i < steps; i++) {
      window.__clock += dtMs;
      const q = window.__rafQ;
      window.__rafQ = [];
      q.forEach((cb) => cb(window.__clock));
    }
  };
</script>
<!-- the game's canvas markup, then -->
<script src="./game.js"></script>
```

Serve it from the same origin as `game.js`, then from your JS: `__pump()` to advance time,
`dispatchEvent` real input events, and assert against **canvas pixels** (the game state is
usually closured and unreadable). Prove the three things the spec promises: spawn/motion
(bright-pixel count rises), input effect (popping/scoring changes pixels), and the lose/win
transition (the game-over overlay floods the canvas dark). The definitive proof is still
playing the _published_ game on the live site, where a foregrounded real-user tab runs rAF
normally.

## Verifying behind sign-in (you don't need the owner's Gmail)

Most authenticated flows can't be checked from a cloud VM by logging in — there is no
browser session and no Google account, and driving Google's login UI with Playwright does
not work (automation walls, CAPTCHA, datacenter IPs). Two working paths, in order of
preference:

**Local — for verifying a change.** Run the app and mint a dev session. No credentials, no
cloud, in-memory store:

```bash
npm run dev
curl -X POST http://localhost:5173/api/auth/dev -c cookies.txt   # session for dev:local
```

This is enough for almost all verification. It exercises real routes, real walls, and the
real SPA. What it does **not** prove: anything about production data, the real generation
pipeline, or deployed config.

**Deployed — for verifying production behaviour.** Use a personal access token
(`docs/agent-access-tokens.md`), issued by the repo owner and supplied as
`GAMEDEV_ACCESS_TOKEN`:

```bash
curl -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" https://www.gamedev.pl/api/auth/me
# driving a real browser? the SPA uses cookies, so exchange the token first:
curl -si -X POST https://www.gamedev.pl/api/auth/session \
  -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" | grep -i set-cookie
```

Rules that matter:

- **Never commit the token, and never paste it into a game, issue, PR, or log.** It is in
  the generated-game credential scanner, so an embedded one fails assembly — but that is a
  backstop, not permission to be careless.
- **A token acts as a real account against real data.** Anything you create is real: use a
  `bot:` account, and clean up what you make.
- **A token deliberately cannot reach operator surfaces or mint another token.** A 404 from
  `/api/admin/*` with a valid token is correct behaviour, not a bug to route around.
- **Exchange once, reuse the cookie.** `/api/auth/session` shares the auth rate limiter
  (20/hour/IP).

## Verify claims, don't relay them

If an agent reports "all tests pass" or "I verified X", reproduce it. Report what **you**
observed, and say plainly when you couldn't check something — a known unknown is far more
useful than an assumed pass.

Watch for exit codes hidden by pipes: `cmd | tail` reports `tail`'s status, not `cmd`'s. Use
`cmd > file; echo "exit=$?"` when the exit code matters.

## When something's wrong

- **Wrong foundation** (wrong base branch, built on stale code): close it and re-dispatch. Do
  not try to salvage — the diff is meaningless against the wrong base.
- **Failing gate**: report the actual failure output; don't merge.
- **Scope creep or touched invariants**: reject that part explicitly rather than quietly
  fixing it, so the boundary stays visible.

## Parallel agents

If more than one agent may touch the repo:

- Give each an isolated location; only one owns the working directory.
- Prefer coordinating through the remote (PRs, the GitHub API) over local git state.
- **A parallel agent can commit mid-review, and `git status`/`git diff --cached`
  snapshots then read inconsistently across calls** — e.g. a file shows as
  staged-modified one moment, then `git diff --cached` is empty the next because HEAD
  advanced under you and the index now matches the new commit. Don't trust a single
  snapshot: confirm with `git diff HEAD -- <path>` and re-check `git log --oneline`
  and "ahead of origin by N" before concluding what a file's final state is.
- Tell each agent explicitly what is off-limits.
- Expect that a mid-task correction may be **indistinguishable from prompt injection** to the
  receiving agent. Scope prompts properly up front so corrections aren't needed.

## Mandatory: keep this skill current

**Updating this skill is part of using it.** Whenever verification surfaces something this
file didn't prepare you for, update it **in the same session, before you finish**.

Update it when:

- An agent found a way to **look verified without being verified** — add that failure mode.
  This is the highest-value thing you can record here.
- A **new class of thing worth checking** in a diff emerged (a dependency, a workflow file, a
  build script, a config that grants privilege).
- An isolation step **failed to isolate** — e.g. a git operation that still disturbed the
  working directory. Record exactly what happened.
- A check here proved to be **noise** — remove it, so the signal stays high.
- The project's **invariants changed** — this file should name what must never regress.

Prefer specifics over principles: "`cmd | tail` masks the exit code" is worth more than "be
careful with pipes". Record what you observed, and flag anything you couldn't confirm.

Treat a verification miss that reached the main branch as a **defect in this skill**, and fix
it here as part of the follow-up.

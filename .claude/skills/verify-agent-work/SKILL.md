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
- **A green unit suite + "I checked it in a browser" can still fail the deploy browser
  gate when the UX flow changed and e2e was not updated.** Observed (#599, 2026-08-05):
  published `/play/<slug>` briefly became preview-first (screenshot + Play, no
  autoplaying iframe; later restored to auto-open, with `/:handle/:slug` staying
  preview-first). Unit tests and claimed manual browser checks were green; deploy's
  `npm run e2e` still waited for `iframe` / `.game-theater-bar` on bare navigation and
  blocked promotion. When a PR changes _when_ a frame mounts (or the copy of an error
  state the gate asserts), update `apps/e2e` in the same PR — the unit suite never
  drives that path.
- **A responsive control can move into an overflow menu while its e2e selector stays
  direct.** Observed (#878, 2026-08-18): the mobile Studio Code action moved behind
  More, but the deploy gate still searched for a visible inline Code button. When a
  responsive redesign changes control placement, exercise the compact interaction
  (open the menu, then select the action) instead of only changing the selector.
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
- **Swapping a Vertex / Gemini model id is not a one-line default change.** Observed
  (#1007, 2026-08-25): `text-embedding-005` → `gemini-embedding-2` kept the legacy
  `:predict` URL and `{ instances: [{ content }] }` body. Google dropped `:predict` for
  that family (`400 FAILED_PRECONDITION`); live `embedText` swallows the error to `[]`,
  so the vector index stays empty and every search returns `{ match: null, score: 0 }`.
  The suite stayed green because it mocked the *old* prediction shape and never asserted
  the request URL. When a model id changes, grep the RPC (`:predict` vs `:embedContent`
  vs `:generateContent`), the request body, and the response parse path — and add a test
  that the constructed URL contains the verb the new model actually serves.
- **A lowered server threshold is a no-op if the client still gates the old value.**
  Same PR: `/api/catalog/search` dropped `findBestMatch` from 0.65 to 0.55 for
  "cross-lingual sensitivity", but `HeroPromptSection` still accepts a vector hit only
  when `data.score >= 0.65`. Scores in the newly admitted band are discarded. When a
  PR changes an accept-set, grep every caller for the old constant; a split threshold
  is a behaviour change that no unit test will see if each side is tested in isolation.
- **A widened substring / alias matcher needs negative controls, not just the prompt
  that motivated it.** Same PR: the new local matcher made `chcę pograć w piłkę` →
  `mexico-86` (intended) and also `I want to play a card game` → `carjack-city`
  (`includes('car')`), `gold rush` / `golden axe` → `mexico-86` (`includes('gol')`),
  `author` / `autumn leaves` → `carjack-city` (`includes('aut')`), `chess` / `szachy` →
  `checker-champ`. The added test only mounted the happy-path prompt. When a matcher
  grows `includes` / alias tables, run the same function on the pre-change branch and
  require a control query that must *not* match.
- **A games-repo PR that adds a GameKit module can 502 play/draft even when its own
  gate is green.** Observed (www.gamedev.pl-games#690, 2026-08-12): `platformer` was
  inserted into `GAME_KIT_MODULES` / `shared/assemble-contract.json` with no paired
  website PR. Website `contract:games-repo` fails when games-repo introduces a name the
  serve side does not recognize; play/draft then 502s for every game that selects it.
  Merge order is website first — same rule as a budget raise
  (`apps/api/src/platform/games-repo-contract.ts`). Diff the module array against _current_
  `main`, not the PR's merge-base: that branch was ~20 commits behind and its array had
  dropped `cards` and `ui` that main had added, so a 2-line "add platformer" diff against
  a stale base is a module deletion against current main.
- **`validate` does not catch leftover create-template copy.** Observed (same PR):
  `moon-hopper` playtest emitted `first-ledge` / `halfway` / `moon` and `end=won`, but
  `SPEC.md` and `GAME.json` still said "Collect five stars in the arena." Check 33 only
  requires that `howToPlay` _exists_. Read SPEC / description / howToPlay against what
  the game actually does — especially on a game that started from `npm run create`.
- **Ambient `declare function` in a tsconfig `include` is a catalog-wide type lie.**
  Observed (same PR): `shared/genres/platformer.d.ts` is included for every game, so
  `play()` typechecks in a non-platformer. The claim that `GAME.json` selects the small
  d.ts was unimplemented (`pack-kit` still digests only `game-kit.d.ts`). A vocabulary
  that is supposed to be opt-in has to be selected the same way modules are — not
  dumped into the root tsconfig.
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
- **A green unit suite can hide a live-only double-transition that a "one-behind"
  window depends on.** Observed (BYOCA CP-1, 2026-08-01): the MCP terminal-receipt
  grant (`get_gate_verdict` readable when the caller's generation is _exactly one
  behind_ current) passed unit tests that set the generation delta by hand — but on the
  real deployed self-build path it was unreachable, always `401 this build is finished`.
  Root cause was a race the unit tests never assembled: an agent that goes straight
  `start → submit_sources` (no intervening `report_progress`) leaves the in-memory
  `record.state` stale, so the delivery's protective `submitted` transition
  (`canTransition(staleState,'submitted')`) is skipped; the round stays `building`, and
  the self backend's `observe()→completed` closes it (`ready_for_review`, generation +1)
  _in parallel with_ the gate verdict closing it again (+1). Net generation is two
  behind, so a window that only admits one-behind can never match. Lessons: (1) when a
  capability's validity is a narrow numeric window (`gen === active - 1`), a unit test
  that hard-sets the delta proves the comparison, not that production ever lands on it —
  drive the real end-to-end sequence; (2) a guard that reads `record.state` after an
  earlier write in the same handler has updated the DB — but not the local object — is
  reading stale state: re-fetch the record or thread the new state through; (3) this
  class of bug fails closed (it rejects access), so it is a contract/UX defect rather
  than a security hole — say so explicitly when reporting, so severity is not
  overstated.
- **Do not assume a 15-minute quiet stall is how self→platform handoff is supposed to
  work.** Observed (BYOCA handoff follow-up, 2026-08-04): ChatGPT-class agents usually
  `submit_sources` and stop. A successful MCP submit now also sets `agentEndedAt`
  (handoff unlock) even if `end` is skipped; `end` still sets `stop:true` for the
  session. Soft `warnings.code=call_end` re-emits until `end`. Quiet is only the
  fallback. `gateStarted` means Cloud Build returned a build id — not mere upload
  acceptance. Reviewing a PR that "fixes" handoff by shortening quiet, redefines
  `gateStarted` as mere upload `accepted` (ignoring Cloud Build create), or drops
  submit→`agentEndedAt` / `call_end` / gate-poll `preserveEnded`, is missing the
  contract — see `.claude/skills/byoca-mcp/SKILL.md`.
- **A fix that narrows a predicate can reintroduce the same defect through a smaller
  door — and its regression test will not notice.** Observed (BY-25, 2026-08-02): a
  correct fix replaced "does the creator have ANY non-abandoned job with this slug"
  (a scan) with "is the NEWEST job for this slug owned by them and non-abandoned" (a
  point read). Both agree in the seeded regression scenario, so a 250-job probe
  encoded straight from the bug report passed. They disagree when a _newer_ job on the
  same slug is abandoned — a canceled improvement round, or the `no_connect` sweep
  auto-abandoning one — at which point ownership of a live published game reads false
  and the durable key is refused with the same misleading "rotated" message the fix
  existed to remove. Lesson: when a fix swaps a **scan** for a **point read**, ask
  what the scan used to tolerate. Enumerate the states the discarded records could be
  in (abandoned, canceled, superseded, owned-by-someone-else) and test the newest
  record in each, not just the one from the bug report.
- **A follow-up that claims "all review findings fixed" can drop items that lived
  only in an issue comment.** Observed (www.gamedev.pl-games#807, 2026-08-19): the
  first pass posted 32 inline findings plus a separate issue comment for two
  `zone.ts` defects that were not in the diff (restart slot stranding, host-disconnect
  zombie actors). The later "all 32 findings fixed" body was true of the _threads_;
  the issue-comment item (host close leaves remotes latched and farmable) was still
  on HEAD. When verifying a "we fixed the review" push, re-probe every promised
  fix — including ones that could not be inlined — and do not treat resolved-thread
  count as the checklist.
- **A whole-action cap check can still leak through a multi-count loop.** Same PR:
  `launch()` started returning before spending ammo when `projectiles.length >= MAX`,
  which fixes the single-rocket case; Feather Flurry still spends one ammo unit and
  then `addProjectile` silently drops the remaining pellets once the cap is hit
  mid-volley (probe: 78/80, ammo 10→9, added 2 of 7). When a fix adds an early
  return at the cap, walk every caller that loops `count` times.
- **Run your probe against the PRE-fix branch too.** A probe that only fails on the
  candidate proves a defect exists; running the identical probe on the base proves
  whether the PR _introduced_ it or merely failed to fix it. Those are different
  verdicts with different remedies, and the A/B costs one command — check out the base
  in a second worktree and run the same file. Pair it with a control case that must
  pass on both, so a green-everywhere result reads as a broken probe rather than a
  clean bill of health.
- **A rollback-after-dispatch fix can still fail before the provider returns.** Observed
  (#770, 2026-08-12): managed providers can launch an MCP session before the awaited
  `dispatch()` resolves. Moving a builder write after that call fixed vendor rejection
  recovery but left the session's first tool call reading the old builder. When an
  awaited vendor call can call back into the app, publish routing state before the call,
  roll it back only when that call rejects, and have the stub read the store in-flight.
- **A PR that changes an error's SHAPE has changed agent behaviour even when no test
  turns red.** Observed (BY-18a, 2026-08-02): a tools/call missing its credential used
  to return a JSON-RPC tool error carrying recovery instructions ("pass sessionKey from
  start(), or configure Authorization: Bearer"); the OAuth work replaced it with a bare
  HTTP 401. The suite stayed green because the assertion was rewritten in the same
  commit. Diff test files for assertions that were _edited_ rather than _added_ — an
  edited expectation is a behaviour change the author decided was acceptable, and it
  deserves the same scrutiny as the source change. For agent-facing surfaces
  specifically, check that any replacement error still tells the agent what to do next;
  a status code is not an instruction.
- **A green games-repo `check:game` does not prove a puzzle's obstacles obstruct.** Observed
  (echo-loop / www.gamedev.pl-games#699, 2026-08-12): TRACE, ACCEPTANCE, agency `--strict`,
  and a scripted capture were green while hold-right + one jump cleared plate/door rooms
  with `ghostCount: 0`. Capture drives the intended path; agency only fails idle / one
  held key; ACCEPTANCE that restates the capture floor (`roomsCleared >= 2`) cannot see a
  skip. For puzzle games, import the pure model in a throwaway clone and prove a
  no-mechanic control _fails_ (walk-only into the door, jump-over) in the same session as
  the intended solve.
- **A training-lab / per-mode closer can be TRACE-green on one happy path.** Observed
  (mexico-86 / www.gamedev.pl-games#811, 2026-08-19): SPEC promised every drill ends in a
  pass/fail verdict; CAPTURE only `waitFor`s `trainingOutcome` after short-pass key 4.
  Isolated `check:game` was green. Walking the other labs showed set-piece choice and STOP
  leave `trainingOutcome=none` with `trainingActed` already true, so the idle closer never
  fires. When a PR adds a per-mode closer, probe each mode (or at least the one that does
  not go through `finishAction`), not only the capture drill.
- **Two writers of one knob, tested in isolation, is not a composition test.** Observed
  (games-repo gfx scale, 2026-08-12, [www.gamedev.pl-games#692](https://github.com/gamedevpl/www.gamedev.pl-games/pull/692)):
  a frame governor stepped the backing-store scale down when fill was slow, and a
  viewport watcher re-derived that same scale from the CSS box on `resize` /
  `orientationchange`. Each path had tests; neither test fired the other. Live, a 1px
  viewport change after a successful step-down restored the high scale, and a session
  latch then froze it there — the iOS URL-bar / virtual-keyboard path. When two
  functions write the same piece of state, the sequence (A then B then A) is the test,
  not A and B separately. A latch that means “stop trying” is only safe if nothing else
  can raise the value underneath it.
- **Stepping a corpse with the live combat solver is not the same as advancing a collapse
  pose.** Observed (bonfire-arena / www.gamedev.pl-games#1198 review, 2026-09-01):
  `stepFighter()` was the only writer of `fallen`, and runtime skipped it on `e.dead`, so
  knights vanished standing. A unit test that called `stepFighter` on a dead fighter
  passed. Wiring the full solver back in left residual `arm.vel` in the still-live
  clash/strike loop; the capture path then never reached `won`. A/B against the pre-fix
  commit proved the regression was the corpse step, not the rebase. `trace:classify`
  on a later fallen-only path was render-only. Advance the pose field the spec names;
  do not keep a dead blade in the exchange.
- **Games-repo `gate-attest` follows CI scope, not the "one game → check:game" heuristic.**
  Observed (bonfire-arena / www.gamedev.pl-games#1237, 2026-09-01): a game-only read of
  rule 5b replaced a correct `npm run check:catalog-static` attest with
  `check:game -- bonfire-arena`. CI still classified the diff as `static` because it also
  touched `tools/idle-agency.ts` and `tools/tests/` (`isStaticOk` widens scoped → static).
  The attest job then failed: required command `check:catalog-static`. Ask
  `node tools/gate-attest.mjs expected` (or the Actions log's `Required command:`) for
  the SHA you are opening; do not "correct" a static attest down to `check:game` just
  because a `games/<slug>/` path is in the diff. `check:pr` remains an accepted alias.

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
- **Cross-repo contracts** — `GAME_KIT_MODULES` / `assemble-contract.json` is lockstep
  with the website. Adding a module without a website-first paired PR 502s play/draft.
  Rebase (or diff against current `main`) before treating the array as additive.

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

For **puzzle** games, also probe the skip, not only the scripted solve. `npm run check:game`
replays `CAPTURE.json`; it will not notice a two-tile door you can jump, a shard door you
can clear without the shard, or an ACCEPTANCE bar that is just the capture floor. Drive
`updateRound` / the pure model with a no-echo / no-key / jump-over control and require that
control to fail.

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

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

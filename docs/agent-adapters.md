# Agent Interchangeability

> **Status: 🚧 Partly built.** The env-driven seam (`AGENT_CMD` / `AGENT_ARGS`) exists and
> works; the profile registry described here does not exist yet.

Goal: swap the coding agent — Claude Code, Codex, "agy", or something not invented yet —
without touching the API, the orchestrator, or the web app.

## Two families, not one

The most important realisation is that "agents" are **not one interchangeable category**.
They split into two kinds with fundamentally different shapes:

|                       | **Container-executed CLIs**                           | **Hosted / remote agents**         |
| --------------------- | ----------------------------------------------------- | ---------------------------------- |
| Examples              | Claude Code, Codex, agy                               | GitHub Copilot coding agent        |
| Where it runs         | Our container, our sandbox                            | Their infrastructure               |
| We control isolation? | Yes                                                   | No                                 |
| Credentials           | Ours (see [`security-model.md`](./security-model.md)) | Theirs / the user's GitHub account |
| Invocation            | `spawn(cmd, args)`                                    | Assign an issue / call an API      |
| Latency               | Seconds–minutes, synchronous-ish                      | Minutes, fully asynchronous        |
| Result arrives as     | Files in a working dir → `GameProject`                | **A pull request**                 |

They should **not** be forced behind one interface. `GameGenerator` (prompt → `GameProject`)
fits the first family. The second family doesn't return a game at all — it returns a _proposed
change to a repo_, which is a much better fit for the **remix → PR** flow
(see [`remix-to-pr.md`](./remix-to-pr.md)) than for the create flow.

**Design consequence:** keep `GameGenerator` for container CLIs. Model hosted agents
separately as a "propose a change to a repo" capability. Trying to unify them produces a
lowest-common-denominator interface that serves neither.

---

## Container CLI adapters

### What actually differs between CLIs

The runner's generic flow (copy template → run command → collect files) already holds for
any CLI. What varies is narrow and declarative:

| Dimension               | Example variation                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Binary name             | `claude`, `codex`, …                                                                                 |
| Sub-command / mode flag | `-p` (print/headless) vs `exec` vs none                                                              |
| Autonomy flag           | how "edit files without asking" is expressed — this is the crux, and every CLI spells it differently |
| Prompt delivery         | positional arg, stdin, or an env var                                                                 |
| Auth env vars           | `ANTHROPIC_API_KEY` vs `OPENAI_API_KEY` vs a token                                                   |
| Base-URL override       | needed to point at our auth proxy                                                                    |
| Install step            | npm global, curl script, distro package                                                              |
| Exit codes              | mostly `0` = success; specifics vary and are often undocumented                                      |

Everything else — the working-dir contract, the output contract, timeouts, stdout hygiene —
is already agent-agnostic in `runner.mjs`.

### Proposed: an agent profile registry

Replace ad-hoc `AGENT_CMD` + `AGENT_ARGS` env wrangling with a small declarative registry,
selected by `AGENT_PROFILE`:

```js
// Illustrative shape, not yet implemented.
{
  id: 'claude-code',
  binary: 'claude',
  // Args for one-shot, autonomous, file-editing operation.
  args: ['-p', '--permission-mode', 'acceptEdits'],
  promptDelivery: 'stdin',        // 'stdin' | 'arg' | 'env'
  authEnv: ['ANTHROPIC_API_KEY'], // forwarded by NAME only
  baseUrlEnv: 'ANTHROPIC_BASE_URL', // so it can be pointed at the auth proxy
  install: 'npm install -g @anthropic-ai/claude-code',
}
```

Benefits:

- **The quirks live in data, not in branching code** — adding an agent is a new entry, not a
  new code path through the runner.
- **Testable without the real CLI**: assert that a profile produces the expected argv and
  prompt delivery. The existing fake-agent test already proves the surrounding flow.
- `AGENT_CMD` / `AGENT_ARGS` remain as an escape hatch for anything not yet profiled, so
  nothing is locked in.

Keep the current safety property: **no profile is active by default**. Unconfigured, external
mode refuses to run, so nothing can execute or spend by accident.

### The autonomy flag deserves special care

The single most fragile part of each profile is the flag that lets the agent edit files
unattended. Get it wrong and the run silently does nothing (or stalls). Each profile should
carry a comment explaining _why_ that specific flag, and profiles should prefer the
**narrowest** option that works — never the "disable all safety checks" variant, which also
tends to disable the protections we are relying on.

---

## Hosted agents (GitHub Copilot)

We already drive this successfully, but note it is a different mechanism entirely: assign an
issue to the Copilot coding-agent bot, and it opens a PR. Practical learnings so far:

- It forks from the repository's **default branch**, not from whatever branch an issue
  mentions. This bit us once (a PR built on the wrong base had to be discarded).
- Its work lands as a PR, so verification is a **code review + CI** problem, not a
  `GameProject` parsing problem.
- Because it runs on their infrastructure with their credentials, our container security
  model doesn't apply — but neither do our guarantees. Treat its output like any external
  contributor's: review before merge.

This makes hosted agents a good fit for **repo-shaped work** (features, fixes, and later the
remix → PR flow) and a poor fit for the low-latency create loop.

---

## What this means for `GameGenerator`

No change needed. The interface (`prompt → GameProject`) is already the right seam for the
create loop, and `MockGameGenerator` / `ContainerGameGenerator` prove it holds for both a
zero-cost offline path and a real containerised one. The profile registry sits _inside_ the
container implementation; nothing upstream needs to know which agent ran.

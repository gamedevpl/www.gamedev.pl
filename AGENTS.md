# AGENTS.md

Guidance for coding agents (Codex, Claude Code, "agy", and others) working in this repo.
GitHub Copilot has an equivalent file at [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

**The `docs/` folder is the plan of record — read [`docs/README.md`](docs/README.md) first.**
Then [`docs/contributing-for-agents.md`](docs/contributing-for-agents.md) for the full guide.

## Fast facts

- npm-workspaces monorepo: `apps/web`, `apps/api`, `packages/game-generator`, `containers/`,
  `infra/`, `docs/`.
- Branch: `the-new-gamedevpl` — **also the repo's default branch, on purpose.** Product: prompt →
  AI-generated game (real HTML/JS/CSS `GameProject`) → played in a sandboxed iframe.
- **`master` is off-limits.** It's the previous hand-built games site, unrelated to this rewrite.
  Never target a PR at `master`, and never merge/rebase `master`'s history into this branch.
- **Safety invariant (never break):** generated games render only in an iframe with
  `sandbox="allow-scripts"` and **no `allow-same-origin`**.
- **ESM only**, TypeScript strict, `.js` extensions in relative imports, Prettier + ESLint
  (zero warnings).

## Green gate — run before finishing any change

```bash
npm install
npm run type-check && npm run lint && npm run test && npm run build
```

`npm run dev` runs everything locally; the generator defaults to the offline `mock` provider,
so no cloud or API keys are needed.

## Shared playbooks (read these — they apply to you too)

These live under `.claude/skills/` because that path makes them auto-loadable for Claude Code,
but **the content is agent-agnostic** and is the project's record of how to work with
autonomous agents here. Read them directly:

| Playbook                                                                                         | When it applies                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`.claude/skills/verify-agent-work/SKILL.md`](.claude/skills/verify-agent-work/SKILL.md)         | **Any time you review, verify, or merge work you didn't write** — from Copilot, another agent, or a subagent. Covers verifying in a throwaway clone, what to check in a diff, and why a passing-looking CI check may be no signal at all. |
| [`.claude/skills/copilot-orchestration/SKILL.md`](.claude/skills/copilot-orchestration/SKILL.md) | When **delegating** work to GitHub Copilot's remote coding agent — dispatch mechanics, which tasks are worth delegating, and the traps (default-branch forking, `action_required` CI).                                                    |

Both carry a **mandatory self-improvement clause**: if you use one and it turns out to be
wrong, stale, or missing something that cost you time, update it in the same session. That
applies regardless of which agent you are.

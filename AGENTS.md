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

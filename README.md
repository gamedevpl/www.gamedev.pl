# Gamedev.pl

Gamedev.pl is becoming a catalog and creation surface for AI-assisted games: describe a game,
a coding agent implements it as **real runnable code** in a dedicated games repository, and a
reviewed build becomes playable in the browser. Players can later propose changes through the
same spec-and-pull-request workflow.

This branch (`the-new-gamedevpl`) contains a local proof of the player loop: **prompt →
deterministic template → sandboxed iframe**, with no external services. The production catalog,
games repository, spec submission, and deployment are not built yet. The previous hand-built
games site lives on the `master` branch.

## Repo layout

```
apps/
  web/               Vite + React + TS frontend — prompt form + sandboxed game player
  api/               Fastify + TS backend — POST /api/generate-game, GET /api/health
packages/
  game-generator/    The generator seam: GameGenerator interface + GameProject type,
                     a deterministic mock, and real HTML/JS/CSS game templates
infra/               Non-deployable placeholder until hosting is selected
docs/                Project documentation — the plan of record; read this first
```

> **Architecture pivot:** games are moving to a **dedicated games repo maintained by coding
> agents**, rather than being generated on demand by this app. Self-hosted agent execution was
> removed for legal reasons. Read [`docs/games-repo.md`](./docs/games-repo.md) first.

## How generation works

Games are **real, unconstrained code** (HTML + JS + CSS), written and maintained by coding agents in a dedicated games repo — not generated on demand by this app. Because arbitrary generated code can't be safety-validated the way structured data can, safety comes from **sandboxed execution**: every game is assembled into one self-contained document and rendered in an `<iframe sandbox="allow-scripts">` with **no `allow-same-origin`**, so it can't reach the parent page, cookies, or storage. A deterministic **mock** generator still drives the local loop offline.

## Getting started

```bash
npm install
npm run dev
```

Starts the API and web app together. Open the printed URL, describe a game, and click Generate.

Other scripts: `npm run build`, `npm run test`, `npm run lint`, `npm run type-check`.

## Documentation

Start with [`docs/README.md`](./docs/README.md). It links the product vision, current and target
games-repo architecture, roadmap, remix→PR spec, and risk log. Coding agents (Copilot, Claude
Code, Codex) should read [`docs/contributing-for-agents.md`](./docs/contributing-for-agents.md)
before making changes.

## Contribution Guidelines

- Submit issues for bugs or feature requests.
- Fork the repository and submit pull requests for code contributions.
- Follow the project's coding conventions and ensure your code is well-documented.

This repository is developed using [Genaicode](https://github.com/gtanczyk/genaicode).

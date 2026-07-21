# Gamedev.pl

Gamedev.pl is becoming a SaaS for AI-created games: describe a game in plain text, an AI agent builds it as **real runnable code**, and you play it in the browser — then play games made by other creators, and (later) remix them into pull requests for the original creator.

This branch (`the-new-gamedevpl`) is a fresh start proving the core loop first: **prompt → AI-generated game → play it in a sandboxed iframe**, running entirely locally with no external services. Accounts, sharing, real agentic generation, and deployment come after. The previous hand-built games site lives on the `master` branch.

## Repo layout

```
apps/
  web/               Vite + React + TS frontend — prompt form + sandboxed game player
  api/               Fastify + TS backend — POST /api/generate-game, GET /api/health
packages/
  game-generator/    The generator seam: GameGenerator interface + GameProject type,
                     a deterministic mock, and real HTML/JS/CSS game templates
containers/          Container-based agent-runner foundation (Phase 1)
infra/               Placeholder for future Terraform/GCP deployment (not used yet)
docs/                Project documentation — the plan of record; read this first
```

> **Architecture pivot:** games are moving to a **dedicated games repo maintained by coding
> agents**, rather than being generated on demand by this app. Self-hosted agent execution was
> removed for legal reasons. Read [`docs/games-repo.md`](./docs/games-repo.md) first.

## How generation works

The AI produces **real, unconstrained game code** (HTML + JS + CSS), not a schema-filled template. Because arbitrary generated code can't be safety-validated the way structured data can, safety comes from **sandboxed execution**: every generated game is assembled into one self-contained document and rendered in an `<iframe sandbox="allow-scripts">` with **no `allow-same-origin`**, so it can't reach the parent page, cookies, or storage. Today a deterministic **mock** generator drives the loop offline; a real containerized coding agent replaces it later.

## Getting started

```bash
npm install
npm run dev
```

Starts the API and web app together. Open the printed URL, describe a game, and click Generate.

Other scripts: `npm run build`, `npm run test`, `npm run lint`, `npm run type-check`.

## Documentation

Start with [`docs/README.md`](./docs/README.md). It links the product vision, architecture (current + target container orchestration), roadmap, the remix→PR spec, and the risk log. Coding agents (Copilot, Claude Code, Codex) should read [`docs/contributing-for-agents.md`](./docs/contributing-for-agents.md) before making changes.

## Contribution Guidelines

- Submit issues for bugs or feature requests.
- Fork the repository and submit pull requests for code contributions.
- Follow the project's coding conventions and ensure your code is well-documented.

This repository is developed using [Genaicode](https://github.com/gtanczyk/genaicode).

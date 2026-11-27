# Builder staging loop

Runs real managed-builder rounds for **new games** against a platform running on your own
machine, so a change to the builder prompt, the MCP tools or the kit can be measured
before it is deployed. One command takes a set of game briefs, builds each one with the
production builder agent and prints how each round went.

## What is real and what is local

| Piece                                  | In staging                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Builder agent, model, effort, advisor  | Production: the same Managed Agents agent (`MANAGED_AGENT_ID`) and environment                 |
| System prompt, kickoff, MCP tools      | This checkout of the platform: `buildApp` with the env-built managed backend, as in production |
| Kit and workspace mounted in the round | Packed from your local games checkout (its `HEAD`) and published as `kits/current.json`        |
| Games bucket                           | A directory: `.staging-runs/<run>/bucket/` (`src/staging/fs-bucket.ts`)                        |
| Gate                                   | `runGate` in-process against a worktree of the games checkout (`src/staging/local-gate.ts`)    |
| Firestore, GitHub, round-0 seed        | In-memory store; no GitHub; no seed, so the round builds from an empty directory               |
| `knowledge_query`                      | Off unless `KNOWLEDGE_SEARCH_ENGINE_ID` and Google credentials are set                         |

The sandbox and the MCP connector have to reach the local API, so the script opens a public
tunnel (`ssh -R` to localhost.run; nothing to install) and sets `APP_BASE_URL` to it. If the
builder environment uses `limited` networking that does not allow the tunnel host, the
script creates a copy of the environment that does, and archives it when the run ends.

## Running it

Needs: the games checkout with `npm ci` done (the gate uses its `node_modules` and Chrome),
an Anthropic API key for the organisation that owns the builder agent, and the agent id.

```bash
export ANTHROPIC_API_KEY=...            # or CLAUDE_API_KEY
export MANAGED_AGENT_ID=agent_...       # the production builder agent
npm run builder:staging -w @gamedevpl/api -- --only platformer
npm run builder:staging -w @gamedevpl/api -- --games ../www.gamedev.pl-games --max-cents 300
```

Options: `--briefs <file>` (default `scripts/staging-briefs.json`), `--only <id,id>`,
`--max-cents` (per-session budget, default 300), `--max-minutes` (default 40),
`--environment-id`, `--public-url` (bring your own tunnel), `--keep-harness`, `--seed`
(keep `GITHUB_TOKEN` so round-0 seeding runs as in production).

Every round costs real API credit, roughly what a production round costs.

## Output

`.staging-runs/<timestamp>/` holds `summary.json` and, per brief, `events.json` (the full
session export), `result.json` (gate verdict and `infra/session-score-lib.mjs` score) and
`gate-report.txt` when the gate was red. Gate artifacts, including capture stills, stay in
`bucket/games/<slug>/versions/`.

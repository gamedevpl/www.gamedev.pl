# Builder runs against production

`npm run builder:run -w @gamedevpl/api` builds new games with the production builder
agent against the production MCP server. Use it to measure a change to the builder's
system prompt or kickoff before you deploy it. You don't need a local platform or a tunnel.

## What is real and what comes from this checkout

| Piece                                   | Source                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Agent, environment, sandbox, advisor    | Production (`MANAGED_AGENT_ID`, `MANAGED_AGENT_ENVIRONMENT_ID`)                      |
| System prompt                           | `builderSystemPrompt({ shell: true })` from this checkout, or `--system <file>`      |
| Kickoff                                 | `buildPrompt` for a creation round from this checkout, plus `--kickoff-extra <file>` |
| MCP tools, kit, gate, moderation, quota | Production: whatever is deployed now                                                 |
| Who owns the games                      | The account behind `GAMEDEV_CREATOR_KEY` (a creator agent key from Studio)           |

The agent starts with `create_game` and builds a self-built round. That is a different path
from a Studio round in four ways:

- there is no round-0 seed;
- there is no mounted workspace, so the agent downloads the kit itself;
- the kickoff has no numbered opening steps;
- creating a game spends the account's daily creation quota.

Changes to MCP tool descriptions or server behaviour only show up after a deploy.

## Running it

```bash
export ANTHROPIC_API_KEY=...                # organisation that owns the agent
export MANAGED_AGENT_ID=agent_...
export MANAGED_AGENT_ENVIRONMENT_ID=env_...
export GAMEDEV_CREATOR_KEY=...              # Studio → agent key; games land on that account
npm run builder:run -w @gamedevpl/api -- --only platformer
npm run builder:run -w @gamedevpl/api -- --runs 2 --kickoff-extra variant.md --max-cents 200
npm run builder:run -w @gamedevpl/api -- --only match3 --prompt   # print prompts, no spend
```

Options:

- `--briefs` (default `scripts/builder-briefs.json`);
- `--only`;
- `--runs`;
- `--model` and `--effort` (default `MANAGED_AGENT_MODEL` / `MANAGED_AGENT_ANTHROPIC_EFFORT`, else `claude-sonnet-5-5` / `medium`);
- `--max-cents` (per-session budget, default 300);
- `--max-minutes` (default 40);
- `--mcp-url`;
- `--title-prefix` (default `[hc] `, so test games are easy to find and delete);
- `--out`.

Each session's vault is archived when the session ends. Ctrl+C interrupts the running session.

## Output

`.builder-runs/<timestamp>/` holds `system-prompt.md` and `summary.json`. Each brief gets its
own folder with:

- `kickoff.md`;
- `events.json` (the full session export);
- `result.json`: the slug, the gate verdict read through `get_gate_verdict`, and the
  `infra/session-score-lib.mjs` score.

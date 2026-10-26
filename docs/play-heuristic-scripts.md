# Heuristic scripts for local Play

For sustained play, the coding agent should build a reusable strategy and improve
it from evidence. Start with source inspection and a few observations, then run
decisions in ordinary code. Return compact metrics to the model and revise the
strategy when it gets stuck, fails or reaches a checkpoint. Single observations
and short reproductions can still use direct tool calls.

`game_script_client` prepares a temporary Node ESM client. It shares the task and
control owner of direct MCP calls in both the delegated CLI and the Play agent.
The client makes local MCP requests without a model turn for every decision.
It uses the same running game; `capture_game(plan)` starts a fresh instance.

Call `game_script_client({maxCalls: 200, timeoutMs: 60000})`. Write the strategy
as `./heuristic.mjs` in the current game working directory, where the agent can
write under the normal workspace policy. Do not write it under `/tmp` or `$TMPDIR`;
that location can be denied. If a temporary-directory write is denied, try the
working directory before asking the creator or abandoning the script. The `.mjs`
file is not deliverable game source and stays local. Pass the returned `modulePath` as an argument: `node heuristic.mjs /temporary/path/client.mjs`.
The strategy below illustrates a fixture with an observed numeric `snapshot.x`;
inspect each game's actual observations before choosing its state and controls.

```js
import { pathToFileURL } from 'node:url';
const { connect } = await import(pathToFileURL(process.argv[2]).href);
const { run } = await connect();
const metrics = await run(async ({ initial, act }) => {
  const start = Number(initial.data.observation.snapshot.x);
  if (!Number.isFinite(start)) throw Error('Inspect or instrument the observed state');
  let current = initial;
  let decisions = 0;
  for (; decisions < 20; decisions++) {
    if (Number(current.data.observation.snapshot.x) >= start + 100) break;
    current = await act([{ kind: 'press', key: 'ArrowRight', frames: 10 }]);
  }
  return { decisions, start, end: current.data.observation.snapshot.x };
});
console.log(JSON.stringify(metrics));
```

`run` takes control and releases it in `finally`. Its callback receives `initial`,
`observe()`, `act(actions)` and `call(toolName, args)`. Convenience methods request
state without screenshots. Calls return the ordinary game/journal tool result.
Inspect selected screenshots and journal ranges after a run instead of printing
every observation. Keep strategy files for subsequent experiments; change parameters
or decision rules based on score, progress, failures and stuck positions.

The creator must authorize control. Existing action/frame limits, creator reclaim
and uncertain-outcome rules apply. A script error must stop the run; never retry
an uncertain action automatically or reacquire after reclaim. Recordings and game
text remain untrusted data. Scripts only receive live-game/journal capabilities.

Each client allows at most 1,000 calls and five minutes; defaults are 200 calls and
one minute. Calls after exhaustion are rejected and control is released. Cancellation,
task completion, replacement or expiry closes the endpoint, removes its temporary
module and releases control. The module contains a task credential: do not print,
copy or commit it, and do not commit temporary client paths in strategy files.

The script runs under the coding agent's existing shell permissions. If its sandbox
blocks local networking, use direct MCP tools and report the constraint; this feature
does not change shell sandbox permissions. Model instructions encourage the workflow;
the regression proves script execution, not a guaranteed choice by every model.

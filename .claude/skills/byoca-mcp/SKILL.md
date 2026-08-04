---
name: byoca-mcp
description: BYOCA / self-build MCP contract for gamedev.pl — session loop (start → kit → stage/submit → gate → end), soft warnings (call_end, progress_stale, inbox_pending), and creator self→platform handoff. Use when adding or changing MCP tools, the agent channel, Studio connect/status for self rounds, or builder handoff behaviour.
---

# BYOCA MCP (self-build)

Creators connect their own coding agent (ChatGPT, Claude, Cursor, …) to a round via
`/api/mcp`. Platform Copilot is a separate builder. This skill is the public-repo
contract; internal planning lives in the ops repo’s `docs/byoca-*.md` (do not copy
private content into PRs).

## Session loop (what agents must do)

Source of truth: `SESSION_WORKFLOW` + `BEHAVIOURAL_CONTRACT` in
`apps/api/src/mcp-server.ts` (returned by `start`, appended to every tool description).

1. `start` → `get_brief` / `get_seed` / `get_sources` / `get_kit` as needed
2. Build; `report_progress`; `send_screenshot` when something draws
3. Prefer `stage_source_file` then `submit_sources({ fromStaged: true, mode, kitEngineRef })`
   - `mode=preview` while iterating; `mode=publish` to seal (TRACE + PLAYTEST required)
   - Each successful stage refreshes Studio’s heartbeat (so a long staging loop is not
     mistaken for quiet / offline)
4. Poll `get_gate_verdict` (and `get_gate_media` after a publish verdict)
5. **After the last successful `submit_sources`, call `end`** if you will not deliver more

### `end` is required after submit (not optional etiquette)

ChatGPT-class agents usually **submit and stop**. That is not enough:

- Successful `submit_sources` returns soft `warnings: [{ code: "call_end", … }]`
- `end` sets `agentEndedAt` → stall `ended` → Studio unlocks **self→platform** handoff
  immediately (creator chooses; API bumps `roundGeneration` so the self token dies)
- Without `end`, creators wait on the **quiet** fallback (~15 minutes silence in
  `building`) — do not treat that timeout as the primary design

`end` does **not** publish, close the job, or bump generation by itself. A green
_publish_ gate still retires the key; `end` is optional after green.

Further channel writes after `end` clear `agentEndedAt` (agent resumed).

## Soft warnings (never `isError`)

Merged by `applySessionNudges` / submit handler. Act, then continue:

| Code             | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| `call_end`       | Call `end` when finished iterating this round   |
| `progress_stale` | Call `report_progress`                          |
| `inbox_pending`  | `read_inbox` → apply → `ack_inbox`              |
| `seed_unread`    | Call `get_seed` before scaffolding from the kit |

## Builder handoff (Studio)

Mid-round switch is refused while the self agent is live (`builder_locked`), except:

| Signal                         | Who                | Effect                                   |
| ------------------------------ | ------------------ | ---------------------------------------- |
| `agentEndedAt` / stall `ended` | Agent called `end` | Primary unlock for self→platform handoff |
| stall `quiet`                  | ~15m silence       | Fallback if `end` was never called       |

`allowsSelfToPlatformHandoff` checks `agentEndedAt` directly so a later
`gate_not_started` stall (ops visibility after a wedged gate) does not revoke handoff.

Handoff goes through creator feedback with `builder: 'platform'` → `resumeBuild` with
generation bump + seed from latest delivery. Do not auto-dispatch platform from `end`.

`no_agent_yet` is waiting to connect, not a handoff.

## Key code

| Area                         | Path                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| MCP tools                    | `apps/api/src/mcp-server.ts`                                |
| Channel (`POST …/end`, …)    | `apps/api/src/agent-channel.ts`                             |
| Stall / `ended`              | `apps/api/src/job-state.ts` (`detectStall`)                 |
| Handoff gate                 | `apps/api/src/builder.ts` (`allowsSelfToPlatformHandoff`)   |
| Feedback / resume            | `apps/api/src/submissions.ts`                               |
| Studio copy / builder choice | `apps/web/src/selfBuildCopy.ts`, `SubmissionStatusView.tsx` |

## Safety invariant (unchanged)

Games render only in an iframe with
`sandbox="allow-scripts allow-pointer-lock"` and **no `allow-same-origin`**.

## Mandatory: keep this skill current

If you change the MCP tool set, submit warnings, stall vocabulary, or handoff rules
and this file is wrong or missing the new behaviour, update it in the same session.

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
4. **Prefer `end` after the last successful `submit_sources`** if you will not deliver
   more — Studio shows the gate; do not sit in a `get_gate_verdict` loop
5. Only poll `get_gate_verdict` when you still need the verdict to decide whether to
   fix before ending (and `get_gate_media` after a publish verdict)

### Never busy-poll `get_gate_verdict`

Agents cannot sleep between tool calls, so “poll every ~30s” turns into a tight
loop that burns connector tool budgets. When `status` is `pending`:

- Honour `retryAfterSeconds` (~30) as **wall-clock** wait before the next poll, **or**
- Call **`end`** and stop — Studio already shows gate progress
- Back-to-back polls emit soft `warnings.code=gate_poll_backoff` (and keep
  re-emitting `call_end` after submit until `end`)

### `kit_outdated` — do not re-upload the tree

When the gate returns `kit_outdated` (or soft copy says the kit rotated):

1. `get_kit` for a fresh `engineRef` only — do not dump the kit into context
2. `submit_sources({ fromLatestDelivery: true, mode, kitEngineRef })` — same `mode` as the
   refused delivery (preview stays preview; omit mode only to reuse that lane). Server
   copies the last candidate; optional `files[]` only for paths you actually changed
3. Do **not** `get_sources` + `stage_source_file` every path again (burns connector tokens)

### `end` is required after submit (not optional etiquette)

ChatGPT-class agents usually **submit and stop**. Soft `call_end` alone was not
enough, so a successful MCP `submit_sources` also sets `agentEndedAt` (unlocks
creator **self→platform** handoff immediately). Still call **`end`**:

- Successful `submit_sources` returns soft `warnings: [{ code: "call_end", … }]`
  (and re-emits `call_end` on later tools until you call `end`)
- `end` sets `stop: true` / `reason: agent_ended` for your MCP session
- Without `end`, your session may look finished while still connected; quiet
  (~15 minutes) remains a fallback only

`gateStarted` is **true when Cloud Build accepted the create** (HTTP 2xx), even
if the build id could not be parsed. If `ok` but `gateStarted: false`, honour
`warnings.code=gate_not_started` (no preview is assembling — safe to retry).
Do **not** retry solely because `buildId` is missing when `gateStarted` is true.

Gate-poll presence (`get_gate_verdict` / `get_gate_media`) refreshes the
heartbeat without clearing `agentEndedAt`, so submit→poll→stop still leaves
handoff unlocked.

`end` does **not** publish, close the job, or bump generation by itself. A green
_publish_ gate still retires the key; `end` is optional after green.

Further channel writes after `end` (or after submit’s auto-`agentEndedAt`) clear
`agentEndedAt` (agent resumed). Studio status polls overlay heartbeat / ended /
stall from the job record outside the 60s cache (and channel `onEvent` busts that
cache), so a resume cannot keep showing “finished this round” next to live progress.

## Credentials and immediate revocation

- Current openers are a creator-wide key or OAuth access, both paired with the game slug.
- Durable per-game keys are retired. Their former management routes return `410`, and
  MCP tools refuse an already-issued key with a reconnect instruction. Do not restore a
  per-game compatibility path in UI, API routes, or MCP tool handling.
- An opener is checked by `start`; later calls use the returned round-scoped `sessionKey`.
  Therefore revoking or rotating a creator key, revoking an OAuth grant, or detecting
  refresh-token reuse must also advance every open self round for that creator via
  `endOpenAgentSessions`. Revoking the opener alone would leave minted session keys live.
- Platform rounds are excluded from that account-credential cleanup because these
  credentials cannot open them.

## Soft warnings (never `isError`)

Merged by `applySessionNudges` / submit handler. Act, then continue:

| Code                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `call_end`          | Call `end` when finished iterating this round                              |
| `gate_not_started`  | Delivery ok but Cloud Build did not start — no preview yet                 |
| `gate_poll_backoff` | Stop tight-looping `get_gate_verdict` — wait ~30s wall-clock or call `end` |
| `progress_stale`    | Call `report_progress`                                                     |
| `inbox_pending`     | `read_inbox` → apply → `ack_inbox`                                         |
| `seed_unread`       | Call `get_seed` before scaffolding from the kit                            |

## Builder handoff (Studio)

Mid-round switch is refused while the self agent is live (`builder_locked`), except:

| Signal                         | Who                                     | Effect                                   |
| ------------------------------ | --------------------------------------- | ---------------------------------------- |
| `agentEndedAt` / stall `ended` | MCP submit (auto) or agent called `end` | Primary unlock for self→platform handoff |
| stall `quiet`                  | ~15m silence                            | Fallback if neither happened             |

`allowsSelfToPlatformHandoff` checks `agentEndedAt` directly so a later
`gate_not_started` stall (ops visibility after a wedged gate) does not revoke handoff.

Handoff goes through creator feedback with `builder: 'platform'` → `resumeBuild` with
generation bump + seed from latest delivery. Do not auto-dispatch platform from `end`.

`no_agent_yet` is waiting to connect, not a handoff.

### Platform session boot (no heuristics)

After a platform dispatch (including self→platform handoff), the job stays
`dispatched` until GitHub's Agent Tasks API reports `in_progress`. That is a real
vendor signal — not a timer. Studio shows phase copy ("Starting agent" / session
booting) and polls tightly on `phase === 'dispatched'`. Feedback also busts the
60s status cache so the previous self stall cannot linger while Copilot is already
queued.

## Key code

| Area                         | Path                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| MCP tools                    | `apps/api/src/mcp-server.ts`                                |
| Account-session invalidation | `apps/api/src/agent-session-revocation.ts`                  |
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

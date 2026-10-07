# Local agent approvals

Interactive `gamedevpl play` and terminal sessions offer **Deny** (the default) and
**Allow once** when a supported local agent requests tool permission. The prompt
shows the vendor payload, including the command/tool arguments and any supplied
working directory, paths and reason. It never rewrites the command or grants a
session-wide rule. Codex permission-profile requests instead offer **Allow for this
turn**: the displayed network/filesystem permissions expire when the current turn
ends. Denial returns an empty grant. Existing vendor permission settings still apply first.

The terminal and authenticated loopback Play panel share one pending question.
Concurrent requests queue; each uses a fresh prompt generation, so a stale click
cannot approve the next request. Follow-up game requests do not answer approvals.
Stop aborts the task and dismisses the question. Escape rejects the current request.
Closing a browser tab leaves the task waiting for a decision; reconnect or answer
in the terminal. Task cancellation, process exit, or the existing task timeout
ends pending decisions. No unattended delegate run gains automatic approval.

Payloads too large to display completely are denied. Approval payloads remain
local; they are not sent as analytics dimensions. This change affects the creator
funnel (instrumentation question 4): existing `cli_step` events such as
`delegate_used`, `verify_failed` and `delivered` remain the queryable signals.
Approval counts and wait time are not separately measured.

## Implemented transports

| Adapter | Mechanism                                                                                                                    | Behavior                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | `--permission-prompt-tool mcp__gamedevpl_local__approve_tool`                                                                | Existing private, bearer-authenticated MCP listener asks the creator and returns `allow` with unchanged `updatedInput`, or `deny`. `acceptEdits` stays enabled. No preview is required. A disconnected MCP caller cancels its question.                                                                           |
| Codex   | `app-server`, `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` | `on-request` policy when the interactive callback is available. Only active-thread requests are accepted; command/file answers are `accept` / `decline`. Permission profiles return the requested permissions with `scope: turn`, or an empty grant on denial/cancellation. Unknown request methods are rejected. |
| Muse    | `serve`, `approval/request` or `approval/requested`, then `approval/decide`                                                  | Server requests receive a presentation receipt. Decisions use server-issued choice and requirement IDs, once per stage. Only `scope: once` may be approved. The old terminal recovery remains for unsupported/custom headless configurations.                                                                     |

`agent-approval.ts` owns presentation and serialization; `claude-approval.ts` and
`live-approvals.ts` translate vendor protocols. The browser uses existing authenticated
`input` commands and prompt IDs, not a new endpoint that executes arbitrary commands.

Tests cover exact Claude inputs, deny/allow, malformed and oversized requests,
disconnects, cancellation, queued/stale responses, Muse multi-stage approvals,
and Codex/Muse subprocess round trips. Real vendor runs still depend on an installed,
authenticated CLI; fake process tests do not establish compatibility with every version.

## Other adapters and GenAIcode

Investigation on 2026-10-08:

| Adapter     | Available integration route                                                                                                                                                | Current gamedevpl status                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Gemini      | ACP `requestPermission`, including `allow_once` / `reject_once` choices ([source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/acp/acpUtils.ts)) | Current JSON-output adapter cannot reply; needs an ACP driver.       |
| Vibe        | ACP `request_permission` ([source](https://github.com/mistralai/mistral-vibe/blob/main/vibe/acp/agent.py))                                                                 | Needs an ACP driver instead of the current streaming CLI.            |
| Copilot     | SDK permission handler / permission-request events ([types](https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts))                                          | Needs an SDK or RPC driver instead of `--no-ask-user`.               |
| OpenCode    | HTTP server permission-response API and SSE events ([server docs](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx))                | Needs a server driver instead of `run --format json`.                |
| Antigravity | Existing interactive terminal permission handoff                                                                                                                           | No verified headless approval-response protocol in this integration. |
| Cursor      | Current adapter uses `--force`                                                                                                                                             | No verified approval callback here; no claim of panel support.       |

GenAIcode 2.9.1 already exports `ApprovalRequest`, `ApprovalDecision`,
`AgentTask.onApproval`, `LiveSession.approve` and the live JSON-RPC transport.
Its Codex/Muse drivers demonstrate approval support; gamedevpl's custom live driver
keeps its stricter steering acknowledgements and screenshot input behavior.
This patch implements the additional vendor translation in gamedevpl against those
APIs, without upgrading GenAIcode. That leaves reusable protocol handling in the
CLI; moving it into GenAIcode would require a library release and dependency bump.
The inspected upstream 2.11.0 Claude driver is still headless and has no built-in
approval callback.

Reusable Claude approval plumbing and ACP / Copilot / OpenCode live drivers would
belong in GenAIcode as additive features, warranting a minor library release, with
gamedevpl upgrading after it is published. Those additional transports are not
implemented by this patch. The current gamedevpl fix uses the CLI's ordinary
`Unreleased` → release PR → published CLI workflow.

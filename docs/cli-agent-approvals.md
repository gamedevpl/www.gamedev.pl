# Local agent approvals

Interactive `gamedevpl play` and terminal sessions offer **Deny** (the default) and
**Allow once** when a supported local agent requests tool permission. The prompt
shows the vendor payload, including the command/tool arguments and any supplied
working directory, paths and reason. It never rewrites the command. Claude Bash
requests also offer **Always allow this exact command (this session)**: subsequent
matching requests in the same checkout session are answered without another prompt.
The whole command string, execution options, agent and working directory must match;
only the tool-call ID and description are ignored. Changed arguments, compound
commands or sandbox overrides require a new decision. This is not a prefix rule or
a grant for every Bash command. Rules live only in this CLI process, survive later
interactive tasks in that checkout, and are cleared by `/permissions ask` or choosing
**Ask** in **Agent permissions**. Browser reloads retain them; restarting the CLI loses
them. No vendor settings are written. Codex permission-profile requests instead offer
**Allow for this turn**: the displayed network/filesystem permissions expire when the current turn
ends. Denial returns an empty grant. Existing vendor permission settings still apply first.

The terminal and authenticated loopback Play panel share one pending question.
Concurrent requests queue; each uses a fresh prompt generation, so a stale click
cannot approve the next request. Follow-up game requests do not answer approvals.
Stop aborts the task and dismisses the question. Escape rejects the current request.
Closing a browser tab leaves the task waiting for a decision; reconnect or answer
in the terminal. Task cancellation, process exit, or the existing task timeout
ends pending decisions. In the default **Ask** mode no unattended delegate run gains
automatic approval; see [Permission modes](#permission-modes).

Payloads too large to display completely are denied. Approval payloads remain
local; they are not sent as analytics dimensions. This change affects the creator
funnel (instrumentation question 4): existing `cli_step` events such as
`delegate_used`, `verify_failed` and `delivered` remain the queryable signals.
Approval counts and wait time are not separately measured.

## Permission modes

`--permissions <mode>` (any verb) or `/permissions` (terminal, and **Agent permissions** in
the Play panel) picks the mode for the rest of the CLI process. Every local task prints it
next to the agent settings (`permissions: Ask`). The default is **Ask**, and nothing is
saved between runs.

| Mode   | GenAIcode `permissions`                                    | Effect                                                                                                                          |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ask`  | none (each adapter's own flags)                            | The creator answers requests or explicitly remembers an exact Claude command. Unattended runs get no approvals.                 |
| `auto` | `{ approval: 'auto-approve', sandbox: 'workspace-write' }` | The agent's own sandbox limits writes to the checkout; requests inside it are approved without asking, also in unattended runs. |
| `yolo` | `'yolo'` (`auto-approve`, `unrestricted`)                  | No sandbox and no questions, also in unattended runs.                                                                           |

GenAIcode translates the mode into each adapter's flags (`applyPermissionArgs`) and into
the Codex/Muse live session. An agent that cannot honor a mode refuses the task with the
reason, instead of running in another mode: Auto-approve needs a vendor sandbox, so Cursor
(`--force` runs unsandboxed), Copilot, OpenCode, Vibe and Muse refuse it; Antigravity refuses
both automatic modes. Automatic decisions appear in the transcript as `Permission
auto-approved: <summary>` (Claude: `claude: auto-approved command: …`). Approvals are
still scoped as requested: one invocation, or the current turn for a Codex profile.
Remembered Claude commands receive a separate one-invocation reply each time;
the CLI does not send a session-wide grant to the vendor.

## Implemented transports

| Adapter | Mechanism                                                                                                                    | Behavior                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | `--permission-prompt-tool mcp__gamedevpl_local__approve`                                                                     | Existing private, bearer-authenticated MCP listener asks the creator and returns `allow` with unchanged `updatedInput`, or `deny`. `acceptEdits` stays enabled. No preview is required. A disconnected MCP caller cancels its question.                                                                           |
| Codex   | `app-server`, `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` | `on-request` policy when the interactive callback is available. Only active-thread requests are accepted; command/file answers are `accept` / `decline`. Permission profiles return the requested permissions with `scope: turn`, or an empty grant on denial/cancellation. Unknown request methods are rejected. |
| Muse    | `serve`, `approval/request` or `approval/requested`, then `approval/decide`                                                  | Server requests receive a presentation receipt. Decisions use server-issued choice and requirement IDs, once per stage. Only `scope: once` may be approved. The old terminal recovery remains for unsupported/custom headless configurations.                                                                     |

`agent-approval.ts` owns presentation and serialization. Vendor protocol translation
comes from GenAIcode (`genaicode/agents` 2.13.0): `claudeApprovalTool` is mounted on the
private local MCP listener (with `claudeApprovalArgs` and `claudeApprovalEnv`, which raises
`MCP_TOOL_TIMEOUT` so Claude waits for the creator), and the custom live driver hands Codex
and Muse requests to `codexApprovals` / `museApprovals`. The driver keeps its own steering
acknowledgements and screenshot input. GenAIcode passes each question an abort signal for
withdrawal, turn end and process exit; its `scope` (`once` or `turn`) picks the button label.
The browser uses existing authenticated `input` commands and prompt IDs, not a new endpoint
that executes arbitrary commands.

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

The Claude, Codex and Muse protocol handling now lives in GenAIcode 2.13.0, with its
protocol tests; gamedevpl keeps presentation and integration tests. Reusable ACP / Copilot /
OpenCode live drivers would belong in GenAIcode as additive features; they are not
implemented yet.

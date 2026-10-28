# Local agent approvals

In **Ask** mode, interactive `gamedevpl play` and terminal sessions offer **Allow once** (first), **Deny**, and then
**Always allow** where supported when a supported local agent requests tool permission. The prompt
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
ends pending decisions. In **Ask** mode no unattended delegate run gains
automatic approval; see [Permission modes](#permission-modes).

Payloads too large to display completely are denied. Approval payloads remain
local; they are not sent as analytics dimensions. This change affects the creator
funnel (instrumentation question 4): existing `cli_step` events such as
`delegate_used`, `verify_failed` and `delivered` remain the queryable signals.
Approval counts and wait time are not separately measured.

## Permission modes

`--permissions <mode>` (any verb) or `/permissions` (terminal, and **Agent permissions** in
the Play panel) picks the mode for the rest of the CLI process. Every local task prints it
next to the agent settings. Without an explicit selection, supported agents default
to **Auto** with a workspace sandbox. Agents without a supported sandbox default to
**Ask**. `/permissions ask` or `--permissions ask` explicitly restores prompts.
Nothing is saved between runs; detached Play workers preserve whether the launch mode
was explicit or implicit.

| Mode   | GenAIcode `permissions`                                    | Effect                                                                                                                          |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ask`  | none (each adapter's own flags)                            | The creator answers requests or explicitly remembers an exact Claude command. Unattended runs get no approvals.                 |
| `auto` | `{ approval: 'auto-approve', sandbox: 'workspace-write' }` | The agent's own sandbox limits writes to the checkout; requests inside it are approved without asking, also in unattended runs. |
| `yolo` | `'yolo'` (`auto-approve`, `unrestricted`)                  | No sandbox and no questions, also in unattended runs.                                                                           |

Claude prompts offer **Resume this task in Auto (sandboxed)** as the fourth choice.
The CLI stops the Ask process, waits for it to exit, closes its approval endpoint,
and resumes the same Claude conversation with workspace sandbox flags and a fresh,
sandbox-aware endpoint. The pending invocation is denied in the old process; Claude
continues the unfinished request in the resumed conversation. Local edits, task
cancellation, and the per-task capture budget are preserved. Auto also applies to
later tasks in this CLI session. Sandbox escapes remain denied.

If Claude has not supplied a conversation ID, the fallback is **Allow once and use
Auto for next tasks**. It changes later tasks only and disappears after selection.
To switch that task immediately, stop it and use `/permissions auto`, then `/retry`.
An unavailable sandbox or a failed resume stops the task; it does not fall back to
an unsandboxed run. Use `/diff` to inspect retained edits and `/retry` to continue.

GenAIcode translates the mode into each adapter's flags (`applyPermissionArgs`) and into
the Codex/Muse live session. Implicit Auto uses sandboxed Claude, Codex and Gemini;
unsupported agents use Ask. Explicit Auto still refuses an unsupported adapter with
a reason: Cursor (`--force` runs unsandboxed), Copilot, OpenCode, Vibe and Muse refuse it;
Antigravity refuses both automatic modes. A sandbox startup failure stops the task;
it never retries without the sandbox. Automatic decisions appear in the transcript as `Permission
auto-approved: <summary>` (Claude: `claude: auto-approved command: …`). Approvals are
still scoped as requested: one invocation, or the current turn for a Codex profile.
Remembered Claude commands receive a separate one-invocation reply each time;
the CLI does not send a session-wide grant to the vendor.

Claude's sandbox auto-allow does not eliminate every Bash permission request.
Commands such as `MODE=test node harness.js`, `make CC=clang`, and calls covered by
content-scoped ask rules can still prompt while remaining sandboxed (see
[Claude sandbox modes](https://code.claude.com/docs/en/sandboxing#auto-allow-mode)).
In Auto, `claude-local-approval.ts` routes those requests through the approval
handler with their exact input. The required sandbox flags remain enabled;
`dangerouslyDisableSandbox` requests and file edits outside the task directory,
including symlinks, are refused before approval. These refusals name the sandbox
policy in both the tool result and local transcript. Ask and YOLO retain their
existing semantics. GenAIcode 2.13.2's blanket refusal of Bash prompts is bypassed
only for ordinary workspace-sandboxed Bash requests; its input validation,
one-call serialization, cancellation and file-path guard are retained.

This changes creator-funnel question 4: existing `cli_step` events for
`delegate_used`, `verify_failed` and `delivered` still measure task outcomes.
Policy reasons and shell commands remain local and are not telemetry dimensions.

## Implemented transports

Local Play exposes `game_git_push` as an approved host action for source repositories.
`gamedevpl:` remotes retain their existing platform Git delivery flow.
When the creator
asks to push, the agent reads the configured remote's push URL and the branch's full
commit SHA, then proposes that exact destination and commit in Play. Approval runs
Git on the CLI host with the creator's existing SSH agent or credential helper;
the agent's shell sandbox remains enabled. The action checks the repository root,
push URL and branch commit again before executing. It pushes that immutable commit
to the same branch, without force, tags, mirror mode or submodule pushes. Multiple
push URLs and changed destinations or branch commits require a new request. Stop
cancels the process group, and a timeout or cancellation reports uncertainty: inspect
the remote before retrying. Existing Git hooks still run. This action never commits
files or publishes on gamedev.pl, and requires approval even in Auto or YOLO.

This affects creator-funnel question 4: `cli_step` events `brain_turn` and
`delegate_used` still describe the task. Git push outcomes remain local; repository
URLs, branches, commit IDs and credentials are not added to telemetry.

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

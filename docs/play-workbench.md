# Local Play workbench

In an interactive terminal, `gamedevpl` opens a browser home with Open and Create.
`gamedevpl play [slug]` opens the matching game (the current checkout when omitted);
`gamedevpl create [idea]` opens a separate creation conversation. Opening home or
choosing Create without submitting an idea does not start an agent. Once a checkout
opens, Play starts automatically; required recovery and account questions appear in
that same browser session.

Use `gamedevpl --terminal`, explicit `repl`, or `connect` for terminal conversation.
`play --preview` retains raw preview. JSON, redirected/non-TTY and `play --stop` keep
the raw-preview path. Explicit `create --play` and `play --edit` also launch a
browser without a TTY; they cannot be combined with JSON, stop or raw-preview flags.
`--no-open` prints the complete session URL instead of opening it.
Browser launches stay in the invoking terminal by default. `Ctrl+C` ends Play and
cancels active local work. Use `gamedevpl --detach` or `gamedevpl play --detach` to
run in the background; `create --detach` also works without a TTY.

Foreground Play prints new conversation messages, agent activity, check stages,
errors and task endings in the terminal. Answer questions and control work in Play;
the terminal is a live activity view. Repeated status polls and restored conversation
history are not replayed. Studio polling snapshots remain in the browser; announced
round boundaries enter the log once through the conversation stream.
Tool activity is limited to one entry per ten seconds, retaining the latest update.
Messages, errors, questions and check stages appear immediately. Pending tool updates
are discarded when the task ends, a question opens or a new phase begins.
`--detach` writes the same timestamped output to an
owner-only local temporary log, and the launcher prints `Play log: <path>`.
Reopening that session prints the log path again; use `tail -f "<path>"` to watch it.
The log remains after the session ends and appends across detached launches in the
same scope, until removed or temporary storage is cleaned. It may contain prompts
and local source text; it is never uploaded as telemetry. `/logs` continues to show
the separate detailed agent task transcript.

Raw preview uses the same full bleed game embedding as the workbench. Reload, sound
and game instructions live in the overlaid Preview controls; they reserve no stage
space. Build errors appear over the last playable build.

On phones, Play keeps its controls in one compact row above the game, including
landscape screens. Fullscreen is available in the tools drawer on phones. Hide controls gives the game the full viewport and leaves a small
handle on the right edge to reopen them. Chat and tools scroll within the available
height when the on-screen keyboard opens.

With `--detach`, the launcher exits; Play ends 60 seconds after the last browser or
paired phone tab closes, once active work finishes. Reopening a tab cancels the
countdown. **Commands → End session** and `gamedevpl stop` end it immediately.
Foreground sessions stay alive while their terminal is open, even with no tabs.
Repeated launches resume the matching session without replaying a supplied idea.
Reopening an already running session preserves its original terminal or background
ownership; the reopening command prints that fact and exits.
New-game intake never inherits the launch directory's existing checkout. An unknown
legacy mutation blocks a new create until reconciled; existing recovery journals and
acknowledged game identities remain authoritative. Explicit `play --edit` without a
slug retains the legacy directory journal for recovery. Interactive terminal `/play`
remains attached to that terminal's lifetime.
Raw local `play --preview` also waits in the terminal; `--detach` runs it in the
background. JSON output stays a one-shot discovery/launch command. Opening a remote
published game requires no local server and returns immediately.

## Finding and stopping sessions

`gamedevpl play --list` shows active workbenches and previews across directories.
Every row includes an ID, game, directory, URL and a stop command. Ordinary `play`
shows the same inventory before opening or reusing its requested session.
`--json` returns the list under `sessions` without opening a browser.

`gamedevpl play --stop` and `gamedevpl stop` target the current checkout; an explicit
slug selects that game. When the same game has sessions in different directories,
stop refuses the ambiguous selection and shows IDs. `--session <id>` stops exactly
one registered server from any directory, and `--all` explicitly stops them all.
The same selection flags work in `/stop` and `/play --stop`.

Legacy previews without directory metadata are listed by ID, and can also be matched
from their original checkout. Unreachable records are ignored. A stop is sent through
the verified loopback server's authenticated endpoint; stale PIDs are never killed.
Closing a remote game tab is outside this local session registry.

## Edit and operate

Chat opens a nonmodal React panel using the website's fonts, tokens and icons.
The game stays mounted and interactive outside the panel. Click the stage to return
keyboard control to the game; typing focuses the composer. The panel can move to
either side or close without resetting the game. Hide controls also closes the panels.

The composer names the session assistant as the initial recipient; builder selection
happens in the existing execution flow. During a local task it labels follow-ups as
queued for the assistant after that task. Opening Chat does not start an agent.
Commands are searchable and typing `/` offers the server's supported action map;
Tab completes a suggestion. Prompt history is shared with the terminal. Up recalls
history at the start of the composer; the history button also supports touch access.
Unsupported slash input stays in the draft with guidance rather than being sent as
an ordinary prompt. Current choices and questions keep their existing semantics.

Screenshot is beside the composer. Other attachments, Devices and Session details
open separate panels; build IDs and raw session output live in details. A missing
session credential and an offline controller have explicit recovery screens and never
appear as a new-game form. Use the complete CLI launch link to authorize a fresh tab.

The overlay shares the CLI controller, guarded command receipts, choice prompts and
follow-up queue. Requests made during an agent task are queued for a fresh task. Stop
cancels the observed task. Buttons invoke fixed CLI domain actions rather than a shell
endpoint. They expose checkout/connect, agent/model selection, status/logs/diff, checks,
source checkpoints, kit updates, pull, delivery, publish requests, takeover, account
information, draft sharing and round cancellation. Publication still follows the
platform's checks and authority rules. Native vendor permission flows that require a
terminal are explicitly unsupported in the detached browser runner; choose a supported
local adapter or perform that vendor handoff from a terminal.

The shared writer lock serializes local agent tasks, kit updates, pulls, deliveries and
checkpoint restoration across CLI processes. A crashed writer's lock is deliberately
not reclaimed from its PID alone: a detached child agent may still be running. Confirm
that the previous child exited before removing that lock. Other editors and arbitrary
shell commands do not participate in this lock.

## Local code editor

**Code** opens the Studio editor beside the game and Conversation. Its sidebar uses
Studio's file tree, with collapsible folders and paths relative to the current game.
**Files** toggles the sidebar; on phones it opens over the editor and closes when a
file is selected. Creator Kit `shared/` and `tools/` remain locked placeholders,
without listing their modules. Their TypeScript sources stay available for local
completion, diagnostics, hover and definitions; following a definition may open its
read-only source. Other games, credentials, hidden files, raster assets and build
configuration are unavailable. The editor uses Studio's CodeMirror, search, undo history,
TypeScript extensions and ghost text rather than a separate editor implementation.

The **Conversation** and **Game preview** buttons show or hide those panels beside
Code. **Dock Code panel** fills the window with the editor, conversation and a small
preview; **Float Code panel** returns to the floating layout. Conversation and preview
can be toggled independently. Focus views use all available space without rounded
cards and respect Conversation's left/right dock preference. On phones the panels
stack vertically, with scrolling when space is limited or the keyboard is open.
**Maximize game** uses the existing **Hide controls** action; **Show Play controls**
restores navigation.

On desktop and tablets wider than 600 px, drag the divider beside Code to resize
Conversation and its game preview. Drag the divider above the preview to change its
height, or the edge of Files to resize the sidebar. These dividers work on either
dock side and keep the editor, drafts and game mounted. Focus a divider and use arrow
keys (Shift for larger steps), Home or End; double-click restores its default.
Sizes stay in local storage for the same local server origin and are clamped when
the window shrinks. Phone layouts keep their stacked panels and Files overlay.

The expand button fills the window with the editor; **Restore Code panel** or **Esc**
returns to the previous view. Editor menus and search consume Esc first. All views
keep the same editor, conversation and game iframe mounted, preserving drafts,
undo history, chat drafts and the running game. Closing Code or opening another tool
returns to the floating layout. Opening Conversation from the toolbar also leaves
an editor focus view so that the requested panel is visible and can receive focus.

Edits stay as drafts until **Save** or **Ctrl/Cmd+S**. Switching files or closing panels
keeps drafts and undo history in the current tab. Closing Code never reconstructs the
game. Saving writes locally and the existing Play watcher rebuilds; Ask, Auto and Freeze
continue to govern when a playable replacement is shown. Save does not deliver, publish
or invoke a platform gate. Dirty drafts, their disk base versions and CodeMirror undo
stacks are backed up in `sessionStorage` and recovered after refreshing the same tab
on the same local controller. Before leaving a tab with unsaved code, the browser
requests confirmation. Closing the tab ends this backup; it is not a cross-session or
machine-restart recovery system. A storage quota failure shows a copy/save warning.

Saves acquire the same checkout writer lock as agents and CLI mutations and compare a
version derived from the read file's contents and filesystem identity. A busy checkout,
stale project, deleted file or changed disk version refuses the write and keeps the draft.
The conflict panel shows disk contents; explicitly reviewing that version allows saving
the draft against its new version. The button states that the next save overwrites those
disk changes; this is an explicit replacement, not a three-way merge. Another disk
change requires another review. Deleted dirty files remain drafts but cannot be saved.
Ordinary editors do not share the CLI lock: version checks catch changes observed before
the atomic replacement, but the filesystem offers no transaction spanning an unrelated
writer's last-moment write. Do not concurrently save the same file from two editors.
Symbolic and hard links are refused. New files and renaming remain tasks for an external
editor or the agent. Text files are capped at 1 MB, the editor snapshot at 16 MB/2000 files.

TypeScript completion, advisory diagnostics, modifier-key hover and Ctrl/Cmd-click
navigation run in a local worker with ES2022/DOM TypeScript libraries and local Creator
Kit sources/declarations. No API key or completion service is required. Released CLIs
download the compressed worker from their own versioned GitHub release on first use;
an embedded SHA-256 verifies it before execution. Later uses work offline from the cache
at `$XDG_CACHE_HOME/gamedevpl/code`, or `~/.cache/gamedevpl/code`. Developer builds carry
the worker locally. A first use without network/cache leaves editing and saving available
and reports unavailable TypeScript. Kit context is read-only; TypeScript library
definitions are not editable project files.

The file picker has a full-path search. Polling sends only a bounded path/stat-revision
index; contents are fetched per changed file. Unchanged files never invalidate the TS
program, and removed files are deleted from its virtual filesystem. Changed dependencies
refresh visible diagnostics even when the selected document has not been edited.

AI completion is optional and off initially. In Code → Optional AI completion, choose a
service, accept the disclosure and press **Enable AI completion**. Code fragments around
the cursor (up to 3000 characters before and 1200 after) are sent through the CLI.

Signed-in members can select **gamedev.pl**, included within the platform's limits, without
an API key or personal provider charges. Sign in through `/login` in Conversation. The CLI
uses its normal authenticated client; platform credentials never reach the browser.
`/api/me/code/completion` accepts local files without requiring a published game or Studio
round. It shares Studio's completer, per-account daily quota, global token budget and
`TAB_COMPLETE` kill switch. It additionally respects `CODE_SURFACE`. Funded local
completion is available by default to signed-in members, including local projects without
a registered game or Studio round. Both deployment paths default `LOCAL_TAB_COMPLETE`
to `true`; set it to `false` to disable local completion without disabling Studio.
Availability never enables AI in the editor: provider selection and consent are still
required for each CLI session. The default model is Gemini
3.8 Flash through **Google Vertex AI** (server configuration
may override it). Availability is cached for 60 seconds; an account or service failure
stops suggestions and never silently switches to a personal provider. Authentication,
blocked accounts, input bounds, minute rate limits and quota checks precede model calls.
Completed local calls log `local_code_completion_usage` with model and actual input/output
token counts, separately from Studio round costs, without source, file paths or identity.
These logs support local token/cost attribution; they are not a job ledger or an invoice.

Alternatively, use a personal OpenAI, Anthropic or Google account. Known CLI environment
variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
expose only availability. Play does not read arbitrary home directories, agent credential
stores or env files. Personal-provider costs belong to that account; keys never enter
browser responses. Default personal models are GPT-4.1 mini, Claude Haiku 4.5 and Gemini
2.5 Flash. Override them with `GAMEDEV_CODE_OPENAI_MODEL`, `GAMEDEV_CODE_ANTHROPIC_MODEL`
or `GAMEDEV_CODE_GOOGLE_MODEL` in the CLI environment. Provider calls use bounded output,
stop sequences and insertion cleanup; model/account access remains the provider's responsibility.

Suggestions use Studio's existing ghost text and Tab acceptance, with a local limit of
120 requests/minute. Rate/quota failures show a message while local TypeScript remains
available. Disable cancels active local requests. Consent lasts for this CLI
session and is cleared when the selected checkout changes. An already-started platform
model call may finish and consume its normal budget after a client disconnect.

## State-preserving updates

The shell uses the same game embedding bridge as Studio. Generated shell titles,
descriptions and padding are hidden; game menus and HUD remain intact. Logical canvas
proportions are preserved. Custom game HTML outside the supported shell contract may
still require game-source changes.

**Ask before update** is the default. A replacement pauses the old game, calls the
existing `__GAME_HARNESS__.snapshotState()`, loads a candidate frame, waits for readiness
and calls `restoreState(data)`. A rejected restore or timeout discards the candidate;
the original frame resumes without being reconstructed. **Restart with update** is an
explicit fallback. No JavaScript closures, GPU resources or arbitrary DOM are serialized.

A game using GameKit persistence must include its timers, RNG and progression in its
snapshot and reject incompatible state in `restoreState`. **Auto — preserve state**
also requires `validateState(data): boolean` and `canHotReload(): boolean` on the
harness; both old and new builds must support validation and the old build must report
a safe point. Otherwise the update waits for a manual decision. **Freeze build** holds
that browser's version. This is state-preserving replacement, not arbitrary code HMR or
an EditorKit persist-to-source editor.

## Evidence

### Let an agent inspect and control this play session

Local delegated Claude, Codex and Copilot tasks receive `game_observe`,
`game_take_control`, `game_act` and `game_release_control` through their existing
task-scoped MCP connection. The optional `--brain app-agent` path exposes the same
tools. No additional model, browser installation or platform round is needed to
observe. Ask the agent to look at the problem, then ask it to take control when
you want it to reproduce the behavior.

`game_observe` reads the game already running in your Play tab: the rendered build
revision, current frame, GameKit snapshot/observation, UI targets, recent diagnostics
and a screenshot. It does not pause or restart the game. While you play, these reads
are not an atomic recording; take control for frame-stable observations. The canvas
composite may omit DOM overlays. Missing game-authored observations remain unknown.

Sending a message selects that tab. With several tabs and no selection, the tools
require a tab ID from their available-tab list; **Session details → Use this game
tab for the agent** selects explicitly. Once control is acquired, subsequent calls
remain pinned to that task, tab and shown build. A source change, reload or tab close
invalidates it. A paired phone and a raw `--preview` window are not controllable.

Taking control pauses real-time play and blocks keyboard and pointer input in the game frame.
`game_act` supports step, press, tap, click, move and drag, up to 32 actions and 600
frames per call (300 per action). It accepts no JavaScript, URLs or paths. Existing
`capture_game` plans still start a separate fresh game; they never take over this tab.
GameKit frame stepping is required for control; `.persist()` is not required.

The visible **Take back control** button works even with Play controls hidden.
It immediately releases input and revokes control for the current task. The agent
must wait for a new creator request before taking control again. Normal release,
task completion/cancellation, disconnect and expired heartbeats release input and
resume play. The frame has its own five-second lease watchdog. Build replacements
wait until control and in-flight observations finish. No action is automatically
replayed after an uncertain result; the agent must observe again.

The connection reuses Play's authenticated loopback presence socket. The CLI routes
it only to MCP tasks for the same local preview, correlates replies with the exact
tab and request, bounds message sizes and serializes operations. Game output is
untrusted data. Neither MCP credentials nor source files enter the iframe, whose
sandbox remains `allow-scripts allow-pointer-lock` without `allow-same-origin`.

This affects creator iteration/return (measurement questions 4–5). Existing local
delegation events still count tasks; live-control success and usage have no aggregate
query yet. Screenshots, inputs, observations and tab IDs stay local and are not
added to telemetry. This is an explicit measurement gap.

Upload/paste images, attach a screenshot, export recent diagnostic input/error events,
or enable canvas recording before saving a recent clip. Media is stored in private local
files until the session ends. A request can carry eight attachments, each up to 16 MB;
the session budget is 128 MB and 100 artifacts. Generated names, SHA-256 hashes, build
revision, device and capture time keep evidence associated with the shown build.
References and intended game assets are separate choices; uploading does not change
source files. Draft text, staged references and uncertain command receipts survive a
browser refresh within the same session. Attachments remain staged until explicitly removed,
including across assistant clarification turns and subsequent tasks.

Screenshots use Studio's canvas/media composite; DOM overlays may be absent. Video
records the largest canvas without audio, in independent eight-second segments; the
latest completed segment is offered. Recording starts only after Enable recording.
MediaRecorder support and encoders depend on the browser. Diagnostic traces are **not
deterministic replays**. Local evidence requires a local builder; the intake service
receives text, and local file handles are attached to the selected task separately.
Agents must inspect supported media through their file tools and explicitly report
unsupported formats. No claim is made that every adapter can interpret video.

## Phone testing

Devices and Commands offer two access models:

- Existing authenticated platform Play/Studio links remain available for delivered
  builds. Delivery is explicit; local file saves do not publish or run a platform gate.
- **Test on phone** starts a separate listener on a selected private LAN interface.
  Scan its QR or open its link on the same trusted Wi-Fi. LAN transport is HTTP, not
  encrypted; use it only on a trusted network. It serves the selected build and accepts
  bounded reports, never editor commands, account credentials or checkout files.

Phone access expires after 30 minutes, can be revoked immediately, and is revoked when
the editor switches preview sources. The phone has independent game state and explicit
build updates. Reports include the phone's shown revision and, when available, its
screenshot and diagnostic trace. Reports appear on the desktop for review before the
creator sends them to an agent. No public tunnel or hosted storage service is installed.

## Recovery and limits

The private session journal records a launch instance, acknowledged game/round,
checkout and pending platform mutation. A successful create followed by failed setup
reopens the acknowledged game. Lost responses leave an **unknown outcome** that blocks
automatic retries of mutations; read-only status remains available. HTTP refusals can
be retried after fixing the cause. The journal does not invent server-side idempotency
or resume a vendor conversation. After a process crash, accepted tasks are never replayed.

A disconnected browser cannot start a process. Re-run the launcher in its original
working directory. If the old controller is still alive but unresponsive, the launcher
refuses a second writer. Journals currently live in the OS temporary directory and are
not a machine-reboot backup or an installed supervisor.

Startup locks record the launcher PID and creation time. An orphaned startup lock is
never removed just because its PID appears dead: inspect the adjacent journal/log and
confirm the launcher, controller and any child agent have exited. Only then remove the
exact lock directory printed by the launcher and repeat the same command. Legacy locks
without owner records require the same process inspection; if ownership is uncertain,
leave the lock in place. Failed owner-record writes clean up their own acquisition.

## Measurement and verification

Creation and editing reuse the existing CLI `first_turn`, `build_requested`,
`delegate_used`, delivery and publication events (creator funnel/return questions 4–5).
No attachment content, paths, pairing capabilities or prompts enter telemetry.
`play_requested` remains an opening request, not render evidence. Workbench adoption,
state-restore success, capture success and phone latency have no aggregate read-side yet;
these are explicit measurement gaps. Local editor events reuse `code_step` and
`code_completion` with `codeSurface: local_play`: opened, file selection, edits, TypeScript
readiness, conflicts, completion latency/results, ghost-text acceptance and dismissal.
Anonymous session ids last for the CLI process. Completion events sample its first 50;
counts are not total billing usage. The private operator console has a separate local
editor aggregate; legacy/Studio events stay separate. No source text, paths, game slug,
credentials or user identity enter these events. Successful saves and layout usage remain
measurement gaps. Paid local usage is attributed separately in server logs as above.

Tests cover command retries, attachment validation, source checkpoint recovery,
unknown remote outcomes and phone authority. Phone protocol tests bind only loopback.
Real device/codec behavior needs a physical phone; desktop narrow viewports do not prove
it. Browser integration checks use synthetic game/API fixtures and incur no paid agent
or platform changes.

## Recovering from a build error

A failed first build replaces “Preparing your game…” with “Build failed”. If an update
fails, Play keeps the last working game and labels the failure “Update could not build”.
The error card provides expandable compiler diagnostics and **Copy error**. Diagnostics
render as text, including paths and line numbers reported by the compiler.

**Retry build** runs the local assembler again without requiring a file edit. It appears
only when the preview server supports retries. Saving source changes still rebuilds
automatically; a successful build clears the error card.

**Fix with agent** opens Chat and stages the compiler output as a diagnostic attachment.
It preserves an existing draft, or fills an empty draft with a repair request. Review the
request and press **Send** to use the normal builder selection and permission flow. The
button is unavailable while answering a question or choosing a builder; it does not answer
an approval or dispatch an agent automatically. If the game changes while evidence is
being attached, Play discards that staged attachment rather than submitting stale evidence.

## Recovering from failed validation

When `/push`, `/submit`, `/publish` or `/verify` fails local verification, the interactive session
shows the failed check's diagnostic output and offers **Fix with agent**, **Check again**
and **Back — keep local changes**. The same choices appear in the terminal and Play's
Conversation. Fix with agent is offered when a local agent is available for that checkout.

Platform source-validation rejections during delivery offer the same menu, including
missing imports/exports, metadata and editor data. The agent receives the platform's
diagnostic report. Network, account and rate-limit failures do not offer agent repair.
Rejected uploads stay staged; no delivery was accepted.
Choosing Back or cancelling keeps local edits and makes no further upload.
Confirmed retries reconcile the paths staged by the rejected upload, including files the
agent removed or renamed and repairs that restore the committed tree. Unrelated staged
work is preserved; changed rejected paths require reviewing Studio before retrying.

If game sources change during verification or while choosing a repair, the session
withholds agent repair until **Check again** supplies fresh diagnostics. Kept-local
notes and ignored media do not invalidate game verification.

Platform diagnostics are tied to the uploaded source snapshot. After a source change,
**Check again** reruns local checks and asks before retrying delivery to obtain fresh
platform diagnostics. Passing local checks does not establish that platform validation passed.

Fix with agent passes the actual diagnostic report through the existing local builder
selection and permission flow. Diagnostics are identified as untrusted tool output;
the repair must preserve game behavior and must not weaken checks or modify shared tools.
The normal verification and repair loop checks the agent's changes afterward.

After a repair or successful recheck of a failed delivery, the session offers **Send preview**
or **Publish game**, according to the original delivery request. Confirming retries that
request with its original checkout and flags and reruns verification before sending.
Repairing a failure from `/verify` only repairs and checks the local game.

Non-interactive commands keep their failure exit code and print diagnostics. Local check
failures include the specific Creator Kit command to run; platform failures explain how
to retry delivery. They do not open a recovery menu.

The local editor browser regression runs without a deployed site or credentials:
`E2E_CHROMIUM_PATH=/path/to/chromium npm run e2e:play-code -w @gamedevpl/e2e`
(after the CLI UI build). It uses a temporary checkout, the real preview watcher and a
fixture assembler. It covers drafts/undo after refresh, incremental content loading,
deleted TS dependencies, local completion/hover/definitions/diagnostics,
writer locks, external conflicts, state-preserving updates, narrow layouts, the iframe
sandbox and absence of Studio/provider requests. The view-switching regression covers
all four focus views, restoring layouts, drafts and undo, chat focus, completion-aware
Escape and a running game's state at desktop, tablet and phone-keyboard sizes. CI builds the CLI UI and runs these local tests
separately from the deployment browser gate. Provider adapters use mocked fetches; funded
ghost text uses a mocked authenticated client.

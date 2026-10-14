# CLI session controller

The interactive CLI's session state lives in `apps/cli/src/session-controller.ts`.
The terminal imports compatibility aliases from `tui/session.ts`; history storage and
Ink rendering stay in their existing modules. There is one conversation, prompt and
follow-up queue per controller instance.

`createSessionCommands` provides an in-process command adapter for additional clients:

- `input` answers the current prompt or chooses one of its actual choices, using its
  `promptId`. A stale response cannot answer a later, identical-looking question.
- `queue` appends to the existing local task queue using its `taskId`. It never answers
  a delivery choice or a model-setting question. Terminal drafts remain untouched.
- `stop` requests cancellation of the observed busy local task and clears its queue.
  It never uses the terminal's idle quit behavior. Acceptance is not process termination.

Each command has an ID. Identical retries return the original receipt; changing the
payload for the same ID is a conflict. Receipts are bounded and are not evicted into
possible re-execution: a full adapter refuses new commands. Message input does not
execute slash commands; operational actions need dedicated adapters. Text length and
terminal control characters are checked.

## Scope and next integration boundary

`SessionCommand` is a typed internal API, not an untrusted JSON validator. The local
browser transport described below validates its envelope, authenticates clients, binds
them to a unique controller instance and shares one adapter across connected clients.
Background supervision and remote access remain outside this layer.

Receipts are memory-only and valid for this instance's lifetime. They do not prove
remote create/submit idempotency or survive a process crash. Process locking, durable
journal/recovery and platform request reconciliation remain separate work. Never replay
old commands against a replacement controller using matching numeric prompt/task IDs.

Existing CLI telemetry stays at its current execution call sites. This extraction does
not emit a second event for a queued prompt or introduce prompt/path identifiers into
analytics. Tests cover two clients sharing the queue, retry/conflict, stale questions
and task cancellation, draft preservation and terminal behavior.

## Terminal workspace

The host mounts the terminal before account verification or Studio token lookup.
`connect` resolves independent account and Studio reads concurrently; the first screen
shows the connection activity and game slug. Commands and local history still wait
for those results, and account verification remains required before restoring history.
This startup change adds no telemetry event or creator-funnel dimension.

The Ink host supplies the current checkout to the same `ReplApp`. By default every session streams
the static transcript into terminal history with no mouse reporting, so native selection, scrollback
and terminal search work unchanged. Ctrl+B opens the workspace sidebar; at 120 columns / 16 rows in a
checkout this renders a full-height conversation with a right sidebar on the terminal's alternate screen.
The scrollable view measures message heights, then replaces offscreen messages with spacers; typing reuses
the visible transcript. Width changes remeasure wrapping, and appended messages retain earlier heights.
Both layouts use `TranscriptLine`, the existing composer, choice handling, diagnostics and diff viewer.

Buffers switch between Ink frames. Entering draws the split layout only after the switch; leaving holds
`<Static>` until the main buffer is back, so output that arrived in the workspace reaches terminal history
exactly once and no workspace frame enters scrollback. Resizing below the split threshold leaves the same way.

The workspace enables SGR button-event mouse reporting (`?1002h`). Wheel reports route to the conversation,
question, diff or diagnostics under the pointer; they never become composer text or choice answers, and row
heights are cached so trackpad bursts remain responsive. Delivery choices retain the conversation above their
question. Left-button drags select text inside the TUI: the selection is clamped to the column it started in,
chat selections are anchored to message rows so streaming output does not move them, and dragging past the
conversation edge scrolls it. Release copies the text (box borders dropped) through `pbcopy` on a local macOS
terminal and OSC 52 elsewhere, wrapped for tmux. Modified drags stay with the terminal's native selection, and
`GAMEDEV_DISABLE_MOUSE=1` keeps reporting off. The display is never paused. Unmounting, including native agent
handoffs, and process exit disable reporting and leave the alternate screen; remounting restores them.
This terminal behavior adds no telemetry event or creator-funnel dimension.

Input retains Ink's raw Escape byte before its keyboard normalization, so pasted
`[<...` and `[M...` strings remain ordinary text. The decoder consumes SGR and
legacy `CSI M` reports, including partial payloads across reads, for multiplexers
that accept tracking but ignore the SGR encoding mode.

TUI input readers preserve bytes through latin1 stream decoding before parsing
legacy coordinates; keyboard text uses a separate streaming UTF-8 decoder.
Reader reference counts preserve bytes during direct Ink mounts. The input
bridge owns physical encoding and restores it when the bridge disconnects.

The host frames terminal escape sequences before Ink reads them. Partial CSI/SS3
prefixes and legacy mouse payloads wait for the next read. Recognized incomplete
mouse reports have no deadline; a 100 ms deadline releases ambiguous Escape/Meta
prefixes that can be standalone keys. Unmounting cancels that timer and disconnects
the input bridge before native terminal handoffs.

Completed CSI/SS3/mouse frames remain separate readable objects, because Ink
parses one key per read. Adjacent plain text stays grouped for pasted input;
framing also retains double-Escape Meta key sequences and Linux-console `ESC[[` function keys.
Complete SS3 frames retain every suffix; keys Ink does not recognize are ignored
instead of exposing their protocol bytes as composer text.
Frames are byte strings and ignore Ink encoding resets, which otherwise merge
queued frames and can replace legacy coordinate bytes before the parser sees them.

The sidebar reads task/queue/preview and Studio updates from the shared session.
`useWorkspaceChanges` samples local game files every three seconds only while visible,
reusing `localGameFiles`, its ignore rules and `hashesOf` against `readBase`. Switching
checkouts clears stale summaries; unmounting or hiding the sidebar stops the timer.
It excludes shared Kit files and makes no network requests or checkout writes. A missing
baseline is unknown, not clean. Remote conflicts still require `/status` or `/diff`.

This passive view adds no telemetry event. Existing `cli_step` actions and funnel
aggregation continue to measure creator progress; sidebar use itself is unmeasured.

## Local browser client

In an interactive terminal session, `/play` opens the local preview with an **Edit game**
overlay. The existing preview shortcut during a delegated task opens the same client.
Standalone `gamedevpl play` and remote games keep their existing preview behavior.

The panel shares the running terminal session: send a request, queue a follow-up while
an adapter works, answer its structured choices, read recent output, or request Stop.
Opening or closing the panel leaves the sandboxed game frame mounted. A new build is
applied with state-preserving replacement when supported; an explicit restart remains the fallback.
Studio and the CLI share the game embedding bridge. See [Play workbench](./play-workbench.md).

The listener binds only to `127.0.0.1` on an ephemeral port. Its random bearer token
arrives in the URL fragment, is removed from the address bar, and stays in tab-scoped
session storage for reloads. State and preview reads require that token. Commands also
require the exact Origin and JSON content type. Host and fetch-site checks reject
foreign origins and DNS rebinding; the sandbox's opaque Origin is rejected. No CORS
permission or generic terminal/shell execution endpoint is exposed.

Version 1 clients poll bounded snapshots with a sequence number. Commands carry a
unique controller session ID plus the existing prompt/task generation and command ID.
On a lost response the UI retries the same envelope, preserving its draft. Strict JSON
envelope validation precedes the in-process command adapter. Only preview URLs returned
by CLI preview startup are registered for the proxy; transcript text alone cannot bind
a new preview. The existing source reader checks assembled content against its revision,
and source generations prevent late responses from attaching a previous preview.

Interactive `/diff` keeps the complete patch outside the conversation. The controller
retains the last eight diffs for this session, and the transcript carries short summaries.
Browser state polls include only diff metadata; authenticated `GET /diff/<id>` loads a
selected patch when the flyout opens. The TUI uses a scrollable viewer (arrows, PgUp/PgDn,
q/Esc to close, Ctrl+D to reopen the latest diff) without clearing terminal scrollback.
Local conversation history stores a rerun reminder instead of patch contents.

**Lifecycle:** terminal `/play` and browser entry commands belong to the invoking
terminal by default. Ctrl+C ends Play and cancels active local work. Browser controllers
keep a private recovery journal. Use `--detach` to run independently of the terminal;
then Play ends 60 seconds after its last tab closes, once active work finishes.
Closing a tab does not interrupt active work. A separate, explicitly enabled LAN listener
serves phone playtests without granting editor authority. Local attachments and fixed
operation commands are described in [Play workbench](./play-workbench.md). Native vendor
permission handoffs for unsupported transports may still require a terminal. Claude,
Codex and Muse approvals use the shared, generation-bound choices described in
[Local agent approvals](./cli-agent-approvals.md). No controller restores a vendor
conversation or automatically retries a mutation whose outcome is unknown.

The browser submits through the existing CLI execution loop, retaining its first-turn,
adapter and creation measurements. Opening Play still records `play_requested`, which
is an open request rather than proof of successful rendering. Browser-vs-terminal use
and local game play health are not separately measured in this increment.

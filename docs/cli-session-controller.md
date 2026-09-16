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

## Local browser client

In an interactive terminal session, `/play` opens the local preview with an **Edit game**
overlay. The existing preview shortcut during a delegated task opens the same client.
Standalone `gamedevpl play` and remote games keep their existing preview behavior.

The panel shares the running terminal session: send a request, queue a follow-up while
an adapter works, answer its structured choices, read recent output, or request Stop.
Opening or closing the panel leaves the sandboxed game frame mounted. A new build is
applied explicitly with **Apply update · restarts game**. This client does not yet restore
runtime state or remove layout inside the game's own HTML.

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

**Current limits:** keep the terminal session open. This listener belongs to that process,
not a detached or supervised controller. Closing a browser tab does not cancel work;
ending the terminal session disconnects the panel. There is no cross-process checkout
lock, durable event replay, remote access, upload flow or browser replacement for native
vendor permission handoffs. Those handoffs still require the terminal. Preview-only
processes retain their existing idle timeout. Polling clients do not establish task
ownership or platform delivery authority.

The browser submits through the existing CLI execution loop, retaining its first-turn,
adapter and creation measurements. Opening Play still records `play_requested`, which
is an open request rather than proof of successful rendering. Browser-vs-terminal use
and local game play health are not separately measured in this increment.

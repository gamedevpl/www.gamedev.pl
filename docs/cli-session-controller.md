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

This is an internal extraction, not a browser workbench release. There is no new HTTP
endpoint, background daemon, browser UI or remote access. `SessionCommand` is a typed
internal API, not an untrusted JSON validator. A future transport must authenticate,
validate its entire envelope, bind to a unique controller instance and expose only
necessary state. It must share one command adapter across all connected clients.

Receipts are memory-only and valid for this instance's lifetime. They do not prove
remote create/submit idempotency or survive a process crash. Process locking, durable
journal/recovery and platform request reconciliation remain separate work. Never replay
old commands against a replacement controller using matching numeric prompt/task IDs.

Existing CLI telemetry stays at its current execution call sites. This extraction does
not emit a second event for a queued prompt or introduce prompt/path identifiers into
analytics. Tests cover two clients sharing the queue, retry/conflict, stale questions
and task cancellation, draft preservation and terminal behavior.

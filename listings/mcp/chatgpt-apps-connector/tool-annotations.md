# Tool annotation justifications — ChatGPT/Codex plugin submission

Paste-ready text for the submission portal's "Tool justification" step, which asks why
each explicit annotation value is accurate.

Source of truth is `apps/api/src/mcp-server.ts`, where four constants supply every
annotation set. Justifications below are grouped by constant, then per tool, because the
grouping _is_ the argument: no tool hand-rolls its hints, so a claim holds for a whole
class rather than resting on one reviewer trusting one sentence.

| Constant      | readOnly | destructive | idempotent | Meaning                                                                 |
| ------------- | -------- | ----------- | ---------- | ----------------------------------------------------------------------- |
| `READS`       | true     | false       | true       | Returns state; writes nothing                                           |
| `WRITES`      | false    | false       | false      | Adds something; removes and overwrites nothing                          |
| `WRITES_ONCE` | false    | false       | true       | As `WRITES`, and repeating it converges                                 |
| `CONSUMES`    | false    | **true**    | varies     | Spends a capped resource or moves a pointer that decides what publishes |

## The claim every tool makes: `openWorldHint: false`

**This is the one a reviewer should press on, so here is the whole answer.** Every tool
reaches exactly one system: gamedev.pl's own API, plus our own Google Cloud Storage bucket
via short-lived signed URLs we mint. No tool browses the web, calls a third-party service,
resolves a caller-supplied hostname, or takes a URL as input. The set of things a call can
touch is fixed at deploy time and is entirely ours.

`submit_sources` is worth stating explicitly, because it accepts agent-authored file
content and that can read like an open world. It is not: the payload is bounded by a
filename allowlist, a per-file and total size cap, and a delivery-count cap, and it causes
the server to write to our own storage and queue our own gate. Nothing in the payload can
make the server fetch anything.

## `CONSUMES` — the two tools that claim `destructiveHint: true`

Both could have claimed `false` and passed a shallow reading. They claim `true` because
`destructiveHint: false` is a promise that a call is purely additive, and a client may skip
its confirmation prompt on that basis.

**`submit_sources`** — spends one of a fixed number of deliveries in the round and moves
the pointer that decides which sources publish. Nothing is erased, but a delivery cannot be
un-spent and the previous candidate stops being the one that ships.

**`ack_inbox`** — makes creator messages stop appearing. Nothing is deleted, but the
creator's message is no longer surfaced to the agent, which is a loss of information from
the agent's side. `idempotentHint: true`: acknowledging the same ids twice changes nothing.

## Per-tool

### Round lifecycle

- **`start`** (`WRITES_ONCE`) — binds this client to a build round and mints a short-lived
  session key. Creates a binding; deletes nothing. Idempotent: rejoining an already-joined
  round returns the same round rather than starting a second one.
- **`create_game`** (`WRITES`) — creates a game that did not exist and removes nothing.
  Spends the same daily creation quota as the website and runs the same moderation.
- **`open_round`** (`WRITES_ONCE`) — opens an improvement round on a published game.
  Idempotent: if a round is already open it returns that one.
- **`continue_draft`** (`WRITES_ONCE`) — resumes an unpublished draft. Additive; the draft
  is not replaced.
- **`end`** (`WRITES` + `idempotentHint: true`) — commits the round. It closes a round
  rather than destroying anything: delivered sources and the gate verdict remain.
- **`open_proposal_round`**, **`submit_proposal`** (`WRITES_ONCE`) — propose a change to
  another creator's game. **Nothing is applied by these tools.** A proposal is a request
  that the owning creator can accept or reject, so it cannot modify anyone else's game.
- **`get_proposal_status`** (`READS`) — reads a proposal's state.

### Reads

`get_brief`, `get_seed`, `get_kit`, `list_kit_files`, `search_kit_files`, `read_kit_file`,
`read_kit_files`, `read_kit_file_fragment`, `get_sources`, `list_examples`, `get_example`,
`list_example_files`, `read_example_file`, `list_staged_sources`, `show_round`,
`show_media`, `get_round_status`, `get_gate_verdict`, `get_round_media`, `get_gate_media`,
`read_inbox` — all `READS`.

Each returns state and writes none. `readOnlyHint: true` is accurate for every one; a
repeated call returns the same thing, hence `idempotentHint: true`.

Two are worth a sentence because their names suggest side effects:

- **`get_gate_verdict`** polls a verdict the gate produced independently. It reads a
  result; it does not run, re-run or influence the gate.
- **`show_round` / `show_media`** render a card in the creator's chat. Rendering a view is
  not a state change: no game, round, delivery or message is created or altered. They are
  `READS` because all they do is read round state and hand it to the client to display.

### Writes

- **`report_progress`** (`WRITES`) — appends a progress note to the creator thread.
  Append-only; earlier notes are untouched. Not idempotent: two calls are two notes.
- **`send_screenshot`** (`WRITES`) — attaches a screenshot. Additive.
- **`stage_source_file`** (`WRITES`) — stages one file for the next delivery. It writes to
  a staging area, not to anything published, and staging is not delivery.
- **`patch_source_file`** (`WRITES`) — edits a **staged** file. It overwrites staged
  content, which is why it does not claim `readOnlyHint`, but it cannot touch published or
  delivered sources.
- **`clear_staged_sources`** (`WRITES`) — discards staging. **The one place the honest
  reading is arguable:** it removes files, which sounds destructive. It claims
  `destructiveHint: false` because staged files are scratch space that has not been
  delivered — nothing a creator can see or that has shipped is lost, and the agent can
  re-stage. A reviewer who disagrees is applying a defensible stricter reading; we would
  change it rather than argue.

## Widget CSP — flagged for the owner, not a justification

The portal shows empty `connect_domains` and `resource_domains` for `show_round` and
`show_media`. Screenshots reach the card as **base64 PNGs** inline, so they need no CSP
entry — but `get_round_media` returns the gameplay **video as a URL**, and our object store
signs those against `storage.googleapis.com` (`apps/api/src/gcs-sign.ts`).

So an empty `resource_domains` will most likely stop the video rendering in the ChatGPT
card, or draw a review question. Confirm before submitting whether
`storage.googleapis.com` belongs in `resource_domains`.

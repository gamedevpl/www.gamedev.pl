# Tool annotation justifications — paste-ready

One block per tool, one code block per form field. Copy each block into the matching box.
Derived from `apps/api/src/mcp-server.ts`, so the tool list and annotation values are the
server's, not a transcription.

Covers exactly the tools `tools/list` advertises (`MCP_VISIBLE_TOOLS`), in the order the
server lists them. Tools that exist only for REST compatibility and are never advertised
to a model (`MCP_UNADVERTISED_TOOLS`) are deliberately absent — the review sees only the
advertised surface.

Every advertised tool sets all four hints (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`) to an explicit boolean on the wire — never null,
never omitted. The 2026-08-22 review round flagged annotations, and the gap was this
document lagging the live surface (seven advertised tools had no justification blocks
here), not the wire values; `mcp-server.test.ts` ("annotates every tool…") pins the
wire values per tool name.

## `start`

**Read Only: False**

```
Binds this client to a build round on the creator's own game and mints a short-lived session key, so it changes server state.
```

**Destructive: False**

```
Additive: it creates a round binding. No game, source file, delivery or message is modified or removed, and rejoining an open round returns that same round.
```

**Idempotent: True**

```
Calling it again for the same round returns the same open round and a key for it rather than creating anything new.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `create_game`

**Read Only: False**

```
Creates a new game on the creator's account, so it writes state.
```

**Destructive: False**

```
Purely additive: it makes a game that did not exist and removes nothing. It spends the same daily creation quota and passes the same moderation as creating a game on the website.
```

**Idempotent: False**

```
Each call attempts to create a new game, so two calls are two creations (bounded by the daily quota).
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `open_round`

**Read Only: False**

```
Opens an improvement round on the creator's own published game, so it changes server state.
```

**Destructive: False**

```
Additive: it opens a round. The published game keeps serving unchanged until a new delivery passes the gate and the creator publishes it. If a round is already open, it returns that one instead of creating a second.
```

**Idempotent: True**

```
While a round is already open, calling it again returns that same round.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `continue_draft`

**Read Only: False**

```
Resumes an existing unpublished draft and opens a round for it, which writes state.
```

**Destructive: False**

```
Additive: the draft's existing content is preserved, not replaced. Repeating the call returns the same resumed round.
```

**Idempotent: True**

```
Repeating the call while the resumed round is open returns the same round.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_brief`

**Read Only: True**

```
Returns the round's brief — title, spec, QA notes, constraints — and writes nothing.
```

**Destructive: False**

```
Read-only; it reads brief data and changes nothing.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_reference_images`

**Read Only: True**

```
Returns the sketches and photos the creator attached to the round, and writes nothing.
```

**Destructive: False**

```
Read-only; the attached images are returned as-is and are not consumed or altered by reading them.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_seed`

**Read Only: True**

```
Returns the platform-generated starter draft for the round, if one exists, and writes nothing.
```

**Destructive: False**

```
Read-only; the seed is returned as-is and is not consumed or altered by reading it.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `regenerate_seed`

**Read Only: False**

```
Queues generation of a replacement starter draft for the round, which writes state.
```

**Destructive: True**

```
Marked destructive because it replaces the round's current generated draft: once the replacement lands, the prior one is gone. It is refused once anything has been staged or delivered, so it can only ever discard a platform-generated draft, never creator-authored work — but replacing existing content is still not additive.
```

**Idempotent: False**

```
Each accepted call queues another regeneration, and the call is capped per round, so repeat calls are not free.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_kit`

**Read Only: True**

```
Returns a reference to the Creator Kit archive and writes nothing.
```

**Destructive: False**

```
Read-only; fetching the kit changes no server state.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The kit download link is a short-lived signed URL for our own storage bucket, minted by us.
```

## `get_kit_api`

**Read Only: True**

```
Returns a compacted reference of the Creator Kit's API surface and writes nothing.
```

**Destructive: False**

```
Read-only; it summarizes reference material without modifying it.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `list_kit_files`

**Read Only: True**

```
Lists file paths inside the Creator Kit and writes nothing.
```

**Destructive: False**

```
Read-only; it enumerates kit contents without modifying them.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `search_kit_files`

**Read Only: True**

```
Searches Creator Kit contents and returns matches, writing nothing.
```

**Destructive: False**

```
Read-only; searching does not modify the kit or any round state.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `read_kit_file`

**Read Only: True**

```
Returns the contents of one Creator Kit file and writes nothing.
```

**Destructive: False**

```
Read-only; kit files are reference material and are not modified by reading.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `read_kit_files`

**Read Only: True**

```
Returns the contents of several Creator Kit files in one call and writes nothing.
```

**Destructive: False**

```
Read-only; it is a batched read of the same reference material, with no write path.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `read_kit_file_fragment`

**Read Only: True**

```
Returns part of one Creator Kit file and writes nothing.
```

**Destructive: False**

```
Read-only; reading a fragment modifies neither the file nor any round state.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `knowledge_query`

**Read Only: True**

```
Answers a natural-language question from an index of our own documentation and source, and writes nothing.
```

**Destructive: False**

```
Read-only; retrieval and answer synthesis leave the corpus and all round state unchanged.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls the gamedev.pl API, which retrieves from a Google Cloud Discovery Engine (Vertex AI Search) data store we configure and own — a fixed, first-party-controlled index built from our own repositories, not an arbitrary third-party service. The tool takes no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_sources`

**Read Only: True**

```
Returns the game's existing source files so a round can continue prior work, and writes nothing.
```

**Destructive: False**

```
Read-only; it reads the current candidate or published sources without altering them.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `report_progress`

**Read Only: False**

```
Appends a progress note to the creator's thread for this round, which writes state.
```

**Destructive: True**

```
Marked destructive because it sends a persistent, creator-visible message that this tool cannot retract or edit — the same reasoning that already applies to a closing summary from end.
```

**Idempotent: False**

```
Two calls produce two notes, so repeating the call is not a no-op.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `screenshot_upload_url`

**Read Only: False**

```
Mints a short-lived signed PUT URL so the agent can upload a PNG into the round. The subsequent PUT writes state.
```

**Destructive: False**

```
Minting the URL does not delete anything. The subsequent PUT is additive: it adds an image to the round.
```

**Idempotent: False**

```
Each call mints a fresh URL, and each upload adds another screenshot.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The returned URL is same-origin.
```

## `stage_upload_url`

**Read Only: False**

```
Mints short-lived signed PUT URL(s) so the agent can upload source files into the round’s staging area. The subsequent PUT writes state.
```

**Destructive: False**

```
Minting the URL does not delete anything. The subsequent PUT applies the same validation as stage_source_file and lands in undelivered staging scratch space.
```

**Idempotent: False**

```
Each call mints fresh URLs; an upload to the same path overwrites the previously staged copy, so repeats are not free.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The returned URLs are same-origin.
```

## `stage_source_file`

**Read Only: False**

```
Writes one file into the round's staging area in preparation for delivery.
```

**Destructive: True**

```
Marked destructive because staging the same path again overwrites what was previously staged there. Nothing delivered or published is touched — staging is scratch space for the next delivery — but the call is not purely additive, so a client should be free to confirm it rather than assume it is safe to repeat.
```

**Idempotent: False**

```
Staging the same path twice overwrites the first copy rather than repeating a no-op.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `patch_source_file`

**Read Only: False**

```
Edits one or more files that are already staged, so it writes state.
```

**Destructive: True**

```
Marked destructive because editing replaces existing staged content, and a patch can remove lines outright. It is bounded to the round’s staging area and cannot reach delivered or published sources, but bounded is not the same as additive.
```

**Idempotent: False**

```
Re-applying the same patch usually fails to match (the text already changed), so repeats do not have the same effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `list_staged_sources`

**Read Only: True**

```
Lists what is currently staged for delivery and writes nothing.
```

**Destructive: False**

```
Read-only; it inspects the staging area without changing it.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `clear_staged_sources`

**Read Only: False**

```
Empties the round's staging area, so it writes state.
```

**Destructive: True**

```
Marked destructive because it deletes staged files. They are undelivered scratch space, so nothing creator-visible or live is lost and the agent can stage them again — but the hint describes what the operation does, and this one removes data.
```

**Idempotent: True**

```
Clearing the same paths (or everything) twice leaves the same empty result the second time — the same reasoning as ack_inbox re-acknowledging already-acked ids.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `delete_source_file`

**Read Only: False**

```
Records that a path should be absent from the round's next delivery, so it writes state.
```

**Destructive: True**

```
Marked destructive because it removes a file from the game the next delivery assembles. The removal only takes effect through a later submit_sources, and delivered or published versions are untouched until then — but the operation exists to make something stop existing, so it is labelled accordingly.
```

**Idempotent: False**

```
The recorded removal persists, but pairing with later staging of the same path means repeats are not guaranteed no-ops.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `submit_sources`

**Read Only: False**

```
Delivers the staged sources to the automated quality gate, which writes state and queues a gate run.
```

**Destructive: True**

```
Marked destructive deliberately. Nothing is erased, but the call spends one of a fixed number of deliveries for the round — which cannot be un-spent — and moves the pointer deciding which sources publish, so the previous candidate stops being the one that would ship. We would rather a client prompt for confirmation than skip it.
```

**Idempotent: False**

```
Each call spends another delivery from the round’s fixed allowance.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Source content is agent-authored but purely inbound: it is bounded by a filename allowlist and size caps, and nothing in it can cause the server to fetch anything.
```

## `end`

**Read Only: False**

```
Commits and closes the round, which writes state.
```

**Destructive: True**

```
Marked destructive because it can send a persistent, unretractable closing message (same reasoning as report_progress) and, via ackInboxIds, acknowledge creator messages so they stop being surfaced to the agent (same reasoning as ack_inbox) — even though delivered sources, screenshots, progress notes and the gate verdict all remain untouched.
```

**Idempotent: True**

```
Calling it again on a closed round changes nothing further; re-acknowledging already-acked ids is a no-op the same way ack_inbox is.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `show_round`

**Read Only: True**

```
Renders a live status card in the creator's chat and writes no server state.
```

**Destructive: False**

```
Read-only; displaying a view creates or alters no game, round, delivery or message.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The card refreshes by calling this same server; it loads nothing from a third party.
```

## `show_media`

**Read Only: True**

```
Renders the gate's screenshots and recording in the creator's chat and writes no server state.
```

**Destructive: False**

```
Read-only; showing media to the creator changes nothing on the server.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Frames are supplied by this server; the gameplay recording is a short-lived signed URL for our own storage bucket.
```

## `get_round_status`

**Read Only: True**

```
Returns the round's current phase and progress for the round view, and writes nothing.
```

**Destructive: False**

```
Read-only; polling status does not advance, alter or end the round.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_gate_verdict`

**Read Only: True**

```
Returns the verdict the automated gate has already produced, and writes nothing.
```

**Destructive: False**

```
Read-only. It reads a result; it does not run, re-run, or influence the gate, and it cannot change whether a delivery passed.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_round_media`

**Read Only: True**

```
Returns the gate's frames for the round view and writes nothing.
```

**Destructive: False**

```
Read-only; retrieving media does not alter the delivery it belongs to.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Frames are returned as inline data by this server; the gameplay recording is a short-lived signed URL for our own storage bucket.
```

## `get_gate_media`

**Read Only: True**

```
Returns the gate's screenshots and gameplay recording for inspection, and writes nothing.
```

**Destructive: False**

```
Read-only; it fetches artefacts the gate already produced and changes nothing.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Media is served from our own storage via short-lived signed URLs we mint.
```

## `read_inbox`

**Read Only: True**

```
Returns pending messages the creator has sent for this round, and writes nothing.
```

**Destructive: False**

```
Read-only. Reading does not acknowledge, consume or clear messages — that requires a separate explicit call.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `get_transcript`

**Read Only: True**

```
Returns one window of the creator conversation and build history for this game, and writes nothing.
```

**Destructive: False**

```
Read-only. It pages through history that already exists; it acknowledges nothing and alters nothing.
```

**Idempotent: True**

```
Read-only: repeating the call returns the same data (or newer data of the same shape) and causes no additional effect.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

## `ack_inbox`

**Read Only: False**

```
Acknowledges creator messages by id, which writes state.
```

**Destructive: True**

```
Marked destructive deliberately. Nothing is deleted, but acknowledged messages stop being surfaced to the agent, so information is lost from the agent's view and the creator's message will not be seen again by it.
```

**Idempotent: True**

```
Acknowledging the same ids twice changes nothing further.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

---

## Widget CSP — check before submitting

Not a justification; a finding the portal surfaced. `show_round` and `show_media` show
empty `connect_domains` and `resource_domains`.

Screenshots reach the card as inline data and need no CSP entry. But `get_round_media`
returns the gameplay **video as a URL**, and our object store signs those against
`storage.googleapis.com` (`apps/api/src/gcs-sign.ts`). An empty `resource_domains` will
most likely stop that video rendering, or draw a review question.

Confirm whether `storage.googleapis.com` belongs in `resource_domains` before submitting.

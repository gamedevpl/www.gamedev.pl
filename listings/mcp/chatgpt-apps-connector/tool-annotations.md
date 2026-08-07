# Tool annotation justifications — paste-ready

One block per tool, one code block per form field. Copy each block into the matching box.
Generated from `apps/api/src/mcp-server.ts`, so the tool list and annotation values are the
server's, not a transcription.

## `start`

**Read Only: False**

```
Binds this client to a build round on the creator's own game and mints a short-lived session key, so it changes server state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Additive: it creates a round binding. No game, source file, delivery or message is modified or removed, and rejoining an open round returns that same round.
```

## `create_game`

**Read Only: False**

```
Creates a new game on the creator's account, so it writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Purely additive: it makes a game that did not exist and removes nothing. It spends the same daily creation quota and passes the same moderation as creating a game on the website.
```

## `open_proposal_round`

**Read Only: False**

```
Opens a proposal round against another creator's published game, which records new state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Nothing belonging to the other creator is changed. A proposal is a request the owning creator can accept or reject; this tool cannot modify their game.
```

## `submit_proposal`

**Read Only: False**

```
Submits the staged proposal for the owning creator's review, which records new state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Additive and cannot alter anyone else's game: it queues a proposal for review. Only the owning creator, acting separately, can apply it.
```

## `get_proposal_status`

**Read Only: True**

```
Returns the current state of a proposal and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it inspects a proposal without changing it or the game it targets.
```

## `open_round`

**Read Only: False**

```
Opens an improvement round on the creator's own published game, so it changes server state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Additive: it opens a round. The published game keeps serving unchanged until a new delivery passes the gate and the creator publishes it. If a round is already open, it returns that one instead of creating a second.
```

## `continue_draft`

**Read Only: False**

```
Resumes an existing unpublished draft and opens a round for it, which writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Additive: the draft's existing content is preserved, not replaced. Repeating the call returns the same resumed round.
```

## `get_brief`

**Read Only: True**

```
Returns the round's brief — title, spec, QA notes, constraints — and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it reads brief data and changes nothing.
```

## `get_seed`

**Read Only: True**

```
Returns the platform-generated starter draft for the round, if one exists, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; the seed is returned as-is and is not consumed or altered by reading it.
```

## `get_kit`

**Read Only: True**

```
Returns a reference to the Creator Kit archive and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The kit download link is a short-lived signed URL for our own storage bucket, minted by us.
```

**Destructive: False**

```
Read-only; fetching the kit changes no server state.
```

## `list_kit_files`

**Read Only: True**

```
Lists file paths inside the Creator Kit and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it enumerates kit contents without modifying them.
```

## `search_kit_files`

**Read Only: True**

```
Searches Creator Kit contents and returns matches, writing nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; searching does not modify the kit or any round state.
```

## `read_kit_file`

**Read Only: True**

```
Returns the contents of one Creator Kit file and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; kit files are reference material and are not modified by reading.
```

## `read_kit_files`

**Read Only: True**

```
Returns the contents of several Creator Kit files in one call and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it is a batched read of the same reference material, with no write path.
```

## `read_kit_file_fragment`

**Read Only: True**

```
Returns part of one Creator Kit file and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; reading a fragment modifies neither the file nor any round state.
```

## `get_sources`

**Read Only: True**

```
Returns the game's existing source files so a round can continue prior work, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it reads the current candidate or published sources without altering them.
```

## `list_examples`

**Read Only: True**

```
Lists curated first-party exemplar games and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; the exemplar catalogue is reference material and is unchanged by listing it.
```

## `get_example`

**Read Only: True**

```
Returns one allowlisted exemplar game and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Exemplars are served from our own storage via short-lived signed URLs we mint.
```

**Destructive: False**

```
Read-only; exemplars are first-party reference material and are not modified.
```

## `list_example_files`

**Read Only: True**

```
Lists the files inside one exemplar and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it enumerates exemplar contents without changing them.
```

## `read_example_file`

**Read Only: True**

```
Returns the contents of one exemplar file and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; exemplar files are reference material and reading does not modify them.
```

## `report_progress`

**Read Only: False**

```
Appends a progress note to the creator's thread for this round, which writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Append-only: it adds a note. Earlier notes are not edited or removed. Two calls produce two notes, which is why it is not marked idempotent.
```

## `screenshot_upload_url`

**Read Only: False**

```
Mints a short-lived signed PUT URL so the agent can curl a PNG into the round. The PUT writes state; there is no base64 screenshot tool.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The returned URL is same-origin.
```

**Destructive: False**

```
Minting the URL does not delete anything. The subsequent PUT is additive: it adds an image to the round.
```

## `stage_source_file`

**Read Only: False**

```
Writes one file into the round's staging area in preparation for delivery.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: True**

```
Marked destructive because staging the same path again overwrites what was previously staged there. Nothing delivered or published is touched — staging is scratch space for the next delivery — but the call is not purely additive, so a client should be free to confirm it rather than assume it is safe to repeat.
```

## `patch_source_file`

**Read Only: False**

```
Edits a file that is already staged, so it writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: True**

```
Marked destructive because editing replaces existing staged content, and a patch can remove lines outright. It is bounded to the round's staging area and cannot reach delivered or published sources, but bounded is not the same as additive.
```

## `list_staged_sources`

**Read Only: True**

```
Lists what is currently staged for delivery and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; it inspects the staging area without changing it.
```

## `clear_staged_sources`

**Read Only: False**

```
Empties the round's staging area, so it writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: True**

```
Marked destructive because it deletes staged files. They are undelivered scratch space, so nothing creator-visible or live is lost and the agent can stage them again — but the hint describes what the operation does, and this one removes data.
```

## `submit_sources`

**Read Only: False**

```
Delivers the staged sources to the automated quality gate, which writes state and queues a gate run.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Source content is agent-authored but purely inbound: it is bounded by a filename allowlist and size caps, and nothing in it can cause the server to fetch anything.
```

**Destructive: True**

```
Marked destructive deliberately. Nothing is erased, but the call spends one of a fixed number of deliveries for the round — which cannot be un-spent — and moves the pointer deciding which sources publish, so the previous candidate stops being the one that would ship. We would rather a client prompt for confirmation than skip it.
```

## `end`

**Read Only: False**

```
Commits and closes the round, which writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
It closes a round rather than destroying its contents: delivered sources, screenshots, progress notes and the gate verdict all remain. Calling it again on a closed round changes nothing.
```

## `show_round`

**Read Only: True**

```
Renders a live status card in the creator's chat and writes no server state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. The card refreshes by calling this same server; it loads nothing from a third party.
```

**Destructive: False**

```
Read-only; displaying a view creates or alters no game, round, delivery or message.
```

## `show_media`

**Read Only: True**

```
Renders the gate's screenshots and recording in the creator's chat and writes no server state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Frames are supplied by this server; the gameplay recording is a short-lived signed URL for our own storage bucket.
```

**Destructive: False**

```
Read-only; showing media to the creator changes nothing on the server.
```

## `get_round_status`

**Read Only: True**

```
Returns the round's current phase and progress for the round view, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only; polling status does not advance, alter or end the round.
```

## `get_gate_verdict`

**Read Only: True**

```
Returns the verdict the automated gate has already produced, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only. It reads a result; it does not run, re-run, or influence the gate, and it cannot change whether a delivery passed.
```

## `get_round_media`

**Read Only: True**

```
Returns the gate's frames for the round view and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Frames are returned as inline data by this server; the gameplay recording is a short-lived signed URL for our own storage bucket.
```

**Destructive: False**

```
Read-only; retrieving media does not alter the delivery it belongs to.
```

## `get_gate_media`

**Read Only: True**

```
Returns the gate's screenshots and gameplay recording for inspection, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time. Media is served from our own storage via short-lived signed URLs we mint.
```

**Destructive: False**

```
Read-only; it fetches artefacts the gate already produced and changes nothing.
```

## `read_inbox`

**Read Only: True**

```
Returns pending messages the creator has sent for this round, and writes nothing.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: False**

```
Read-only. Reading does not acknowledge, consume or clear messages — that requires a separate explicit call.
```

## `ack_inbox`

**Read Only: False**

```
Acknowledges creator messages by id, which writes state.
```

**Open World: False**

```
Calls only the gamedev.pl API on our own domain. It performs no web access, contacts no third-party service, and accepts no URL or hostname as input, so the set of systems a call can reach is fixed by us at deploy time.
```

**Destructive: True**

```
Marked destructive deliberately. Nothing is deleted, but acknowledged messages stop being surfaced to the agent, so information is lost from the agent's view and the creator's message will not be seen again by it. Acknowledging the same ids twice changes nothing further.
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

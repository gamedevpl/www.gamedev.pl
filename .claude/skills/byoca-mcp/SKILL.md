---
name: byoca-mcp
description: BYOCA / self-build MCP contract for gamedev.pl — session loop (start → kit → stage/submit → gate → end), soft warnings (call_end, progress_stale, inbox_pending), and creator self→platform handoff. Use when adding or changing MCP tools, the agent channel, Studio connect/status for self rounds, or builder handoff behaviour.
---

# BYOCA MCP (self-build)

Creators connect their own coding agent (ChatGPT, Claude, Cursor, …) to a round via
`/api/mcp`. Platform Copilot is a separate builder. This skill is the public-repo
contract; internal planning lives in the ops repo’s `docs/byoca-*.md` (do not copy
private content into PRs).

## Session loop (what agents must do)

Source of truth: `SESSION_WORKFLOW` + `BEHAVIOURAL_CONTRACT` in
`apps/api/src/mcp-server.ts` (returned by `start`, appended to every tool description).

1. `start` → `show_round` (once) → `get_brief` / `get_seed` / `get_sources` / `get_kit` as needed
2. Build; `report_progress`; `send_screenshot` when something draws
3. Prefer `stage_source_file` (new/full rewrite) or `patch_source_file` (unified diff) then
   `submit_sources({ fromStaged: true, mode, kitEngineRef })`
   - **Edits:** prefer `patch_source_file({ path, old, new })` (exact unique substring
     replace — no diff format). Or `patch_source_file({ path, patch })` with a unified
     diff (`---` / `+++` + `@@` hunks; bare `@@` ok). Do not re-emit whole `render.ts` /
     `model.ts` files through `stage_source_file`
   - **Modules:** soft budget ~350 lines / ~12 KiB per `game/*.ts`. Honour
     `warnings.code=module_too_large` (on `get_sources` / `get_seed` / stage / patch)
     by splitting cohesive pieces _before_ more feature work — same urgency as
     `call_end`. Recipes: render→`art`/`ui`/`hud`/`rooms`; model→`tables`/`layout`/
     `types`; runtime→systems
   - `fromStaged` overlays onto the latest delivery/seed — stage only changed paths
   - `mode=preview` while iterating; `mode=publish` to seal (TRACE + PLAYTEST required)
   - Each successful stage/patch refreshes Studio’s heartbeat (so a long staging loop is not
     mistaken for quiet / offline)
   - Each stage may also publish a **live preview** of the buffer — see below
4. **Prefer `end` after the last successful `submit_sources`** if you will not deliver
   more — Studio shows the gate; do not sit in a `get_gate_verdict` loop
   - **`preview_failed` / `red`:** do **not** stop at `stage_source_file` / `show_round`.
     Honour `warnings.code=must_fix_gate`, fix, then `submit_sources` again on the same
     key. Staging alone leaves the creator card on the refused delivery.
5. Only call `get_gate_verdict` once when an already-available verdict would change
   what you deliver — and when that check _does_ return a publish verdict, call
   `get_gate_media` once before `end`

### `get_gate_media` must stay reachable from the loop

The step originally read "once a publish verdict lands", immediately after three steps
telling the agent to `end` rather than wait for one. Agents that follow the workflow
literally therefore never reached it: observed as Claude-family clients rarely calling
`get_gate_media` while ChatGPT, treating the loop as advice, used it comfortably
(owner test, 2026-08-03).

It is now tied to **a verdict already in hand** — a state the loop genuinely reaches —
and still forbids waiting for one. When editing this loop, keep that property: a step
gated on a condition the loop is told to avoid is a step that does not exist.

**Both lanes carry frames** — see [Preview stills](#preview-stills-by-28a--frames-without-a-publish)
below. That was not true when this section was written: the preview lane was typecheck →
smoke → build, and `smoke` executes the game in `node:vm` against a _recording fake
canvas_, not a browser, so nothing before publish produced a pixel. Adding real capture
compute was the cost and threat-model decision BY-28a took; it is no longer a copy change
away.

Still true, and the reason the lane field exists: **a green preview is not publish
readiness.** It says the game typechecks, smokes and assembles. Nothing more.

**Staged sources still produce no frames.** Staging assembles a document (creator-visible,
see below) but never runs a browser. Only a delivery to the gate captures.

### Never busy-poll `get_gate_verdict`

Agents cannot sleep between tool calls, so “poll every ~30s” turns into a tight
loop that burns connector tool budgets. `get_gate_verdict` is therefore a one-shot
check, not a wait loop. When `status` is `pending`:

- With a real `deliveryId`, the response returns `stop: true`,
  `reason: gate_pending`: stop the agent run immediately and let Studio show the
  eventual result
- With `deliveryId: null`, nothing has been delivered: the response returns
  `stop: false`, `reason: no_delivery`; continue building and call
  `submit_sources` instead of checking again
- `retryAfterSeconds` (~30) is informational for a later creator-led run checking a
  delivered gate, not permission to wait and call again in the current run
- Back-to-back calls emit soft `warnings.code=gate_poll_backoff` (and keep
  re-emitting `call_end` after submit until `end`)

**`stop` describes the round now, not forever.** It is point-in-time state, not a
latch: a `stop: true` from an earlier poll is spent once that run stops. A later
delivery makes the round live again and the next check answers `stop: false` /
`access: active`. So a creator-led run does not inherit a previous run's stop, and an
agent should read the `stop` in the response it just got rather than the one it
remembers. (Observed 2026-08-05: an agent treated a stale `stop: true` as a standing
prohibition and reported a protocol violation, while the response in front of it said
`stop: false`.)

### `kit_outdated` — do not re-upload the tree

When the gate returns `kit_outdated` (or soft copy says the kit rotated):

1. `get_kit` for a fresh `engineRef` only — do not dump the kit into context
2. `submit_sources({ fromLatestDelivery: true, mode, kitEngineRef })` — same `mode` as the
   refused delivery (preview stays preview; omit mode only to reuse that lane). Server
   copies the last candidate; optional `files[]` only for paths you actually changed
3. Do **not** `get_sources` + `stage_source_file` every path again (burns connector tokens)

The window is **same-major semver**, not the last two published kits. `shared/kit-version.json`
in the games repo declares the kit's contract version; the gate accepts any delivery whose kit
shares its major, however many kits have landed since. So a `kit_outdated` verdict now means a
genuine breaking change, not that the repo merged twice while the agent was working.

It used to mean the latter, and often did: on 2026-08-05 seven kits published in ten hours, a
`get_kit` answer was good for 45–90 minutes, and three consecutive rounds were refused for age —
one over a commit that added an internal probe script. `apps/api/src/kit-window.ts` is the rule;
the games repo's `docs/kit-versioning.md` is when to bump.

### Staging is creator-visible (live staged preview)

`apps/api/src/staged-preview.ts` assembles the **staging buffer itself** and stores it as
an ordinary `BuildPreview`, so the creator plays what the agent has staged long before a
delivery or a gate run. Studio floats it as a muted, non-interactive frame above the
composer (`apps/web/src/StudioLivePreview.tsx`); clicking opens the normal theater.

- Fires from the channel’s `PUT …/sources/stage` via `onSourcesStaged`, **off** the
  response path — a staging receipt never waits on an assembly.
- Debounced (~6s) with a per-job floor (~25s) so a staging burst costs one assembly.
- Overlay is **staged > last delivered version > seed**, so a one-file stage on an
  improvement round still renders a whole game. Needs `index.html`, `game.ts`,
  `style.css`, `GAME.json` present across that overlay; short of that it does nothing.
- Reuses the serve path (`getGameSources` + `assembleGameHtml`, `restrictNetwork`), so a
  live preview passes the same CSP / provenance / credential-scan hygiene as a published
  game. It never writes `gate` or `previewGate` and can never publish.
- Failure is the normal state and is silent: a buffer that does not compile leaves the
  previous preview standing. Identical bytes are not republished.

Agents should therefore **stage a runnable tree early and keep staging** — it is the
cheapest way to show the creator progress, and it costs no turns.

### Preview stills (BY-28a) — frames without a publish

The live staged preview shows the **creator** a playable game; it does nothing for an
agent that cannot run one. So the preview gate lane now also takes stills:
`check:game --preview --preview-stills` runs the capture plan but skips the per-frame
screenshots and the ffmpeg encode, keeping only the named marks.

- Nearly free: a preview build already `apt-get install`s Chrome for a capture it never
  ran. The expensive halves — a CDP screenshot per frame, and the video — are skipped.
- **Advisory stage.** A capture failure reports and the lane still passes; a machine
  with no browser previews exactly as before.
- **Kill switch:** `GATE_PREVIEW_STILLS=0` on the gate runner drops the flag with no
  deploy. Volume is already bounded by `SELF_BUILD_DELIVERY_CAP` (20 per round, shared
  by preview and publish).
- `manifest.previewGate.screenshot` names the frame; `get_gate_media` serves either
  lane and reports `gate.lane: 'preview' | 'publish'`. **Publish wins when both exist.**
- Agents must not read a green _preview_ as publish readiness — hence the lane field.
- No video on the preview lane, ever: nothing renders an inlined mp4, and the encode is
  the expensive half.

### `end` is required after submit (not optional etiquette)

ChatGPT-class agents usually **submit and stop**. Soft `call_end` alone was not
enough, so a successful MCP `submit_sources` also sets `agentEndedAt` (unlocks
creator **self→platform** handoff immediately). Still call **`end`**:

- Successful `submit_sources` returns soft `warnings: [{ code: "call_end", … }]`
  (and re-emits `call_end` on later tools until you call `end`)
- `end` sets `stop: true` / `reason: agent_ended` for your MCP session
- Without `end`, your session may look finished while still connected; quiet
  (~15 minutes) remains a fallback only

`gateStarted` is **true when Cloud Build accepted the create** (HTTP 2xx), even
if the build id could not be parsed. If `ok` but `gateStarted: false`, honour
`warnings.code=gate_not_started` (no preview is assembling — safe to retry).
Do **not** retry solely because `buildId` is missing when `gateStarted` is true.

Gate-poll presence (`get_gate_verdict` / `get_gate_media`) refreshes the
heartbeat without clearing `agentEndedAt`, so submit→poll→stop still leaves
handoff unlocked.

`end` does **not** publish, close the job, or bump generation by itself. A green
_publish_ gate still retires the key; `end` is optional after green.

Further channel writes after `end` (or after submit’s auto-`agentEndedAt`) clear
`agentEndedAt` (agent resumed). Studio status polls overlay heartbeat / ended /
stall from the job record outside the 60s cache (and channel `onEvent` busts that
cache), so a resume cannot keep showing “finished this round” next to live progress.

## Credentials and immediate revocation

- Current openers are a creator-wide key or OAuth access, both paired with the game slug.
- Durable per-game keys are retired. Their former management routes return `410`, and
  MCP tools refuse an already-issued key with a reconnect instruction. Do not restore a
  per-game compatibility path in UI, API routes, or MCP tool handling.
- An opener is checked by `start`; later calls use the returned round-scoped `sessionKey`.
- **`show_media` is how the creator sees the game.** `get_gate_media` attaches frames as
  image blocks, which reach the _model_ — it can look at them and describe them, and there is
  no path back out. Asked to display them, ChatGPT answered "the image attachments apparently
  didn't render in your view" and the creator saw nothing (2026-08-06). A tool result is input
  to a model, not output to a person, so a view is the only surface that puts pixels in the
  conversation. `show_media` carries no bytes: the card fetches them over the app-only
  `get_round_media`, keeping a megabyte of base64 out of the model's context.
- **`show_round` opens the creator's status card**, and exists for nothing else. Agents do not call it on their own — ChatGPT never did until the creator
  asked (2026-08-05) — so a view-capable session that has not opened one gets a bounded
  `warnings.code=card_unopened` nudge, the same remedy `call_end` needed. Never sent to a
  client with no views. It used to hang off `start` and `get_gate_verdict`, which made the card a side
  effect of workflow mechanics — an agent that re-ran `start` before each operation left one
  card per call (ChatGPT, 2026-08-05). The host renders one card per call carrying `_meta.ui`,
  so when adding a view, give it its own tool rather than attaching it to a tool agents call
  for their own reasons.
- **`start` is once per round.** The key is valid until `expiresAt` (hours), so re-running `start`
  to "refresh" it is wrong: it costs a round trip each time and, in an MCP Apps host, leaves a
  duplicate round card in the conversation per call. Re-run it only after a call is refused as
  unauthenticated. Observed 2026-08-05: ChatGPT called `start` before each operation and said it
  did so "to reacquire the key" — a fair reading of _short-lived_ that nothing in the contract
  corrected. `SESSION_WORKFLOW`'s first step now does.
  Therefore revoking or rotating a creator key, revoking an OAuth grant, or detecting
  refresh-token reuse must also advance every open self round for that creator via
  `endOpenAgentSessions`. Revoking the opener alone would leave minted session keys live.
- Platform rounds are excluded from that account-credential cleanup because these
  credentials cannot open them.

## Soft warnings (never `isError`)

Merged by `applySessionNudges` / submit handler. Act, then continue:

| Code                | Meaning                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call_end`          | Call `end` when finished iterating this round                                                                                                                              |
| `must_fix_gate`     | Last delivery refused (`preview_failed` / `red` / `kit_outdated`) — fix and **`submit_sources` again**; staging alone does not re-run the gate or refresh the creator card |
| `must_deliver`      | Nothing delivered yet — submit before finishing                                                                                                                            |
| `gate_not_started`  | Delivery ok but Cloud Build did not start — no preview yet                                                                                                                 |
| `gate_poll_backoff` | Repeated one-shot gate check — stop checking; build/submit or honour `stop:true`                                                                                           |
| `progress_stale`    | Call `report_progress`                                                                                                                                                     |
| `inbox_pending`     | `read_inbox` → apply → `ack_inbox`                                                                                                                                         |
| `seed_unread`       | Call `get_seed` before scaffolding from the kit                                                                                                                            |

## Builder handoff (Studio)

Mid-round switch is refused while the self agent is live (`builder_locked`), except:

| Signal                         | Who                                     | Effect                                   |
| ------------------------------ | --------------------------------------- | ---------------------------------------- |
| `agentEndedAt` / stall `ended` | MCP submit (auto) or agent called `end` | Primary unlock for self→platform handoff |
| stall `quiet`                  | ~15m silence                            | Fallback if neither happened             |

`allowsSelfToPlatformHandoff` checks `agentEndedAt` directly so a later
`gate_not_started` stall (ops visibility after a wedged gate) does not revoke handoff.

Handoff goes through creator feedback with `builder: 'platform'` → `resumeBuild` with
generation bump + seed from latest delivery. Do not auto-dispatch platform from `end`.

`no_agent_yet` is waiting to connect, not a handoff.

### Platform session boot (no heuristics)

After a platform dispatch (including self→platform handoff), the job stays
`dispatched` until GitHub's Agent Tasks API reports `in_progress`. That is a real
vendor signal — not a timer. Studio shows phase copy ("Starting agent" / session
booting) and polls tightly on `phase === 'dispatched'`. Feedback also busts the
60s status cache so the previous self stall cannot linger while Copilot is already
queued.

## Key code

| Area                         | Path                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tools                    | `apps/api/src/mcp-server.ts`                                                                                                                                              |
| Account-session invalidation | `apps/api/src/agent-session-revocation.ts`                                                                                                                                |
| Channel (`POST …/end`, …)    | `apps/api/src/agent-channel.ts`                                                                                                                                           |
| Stall / `ended`              | `apps/api/src/job-state.ts` (`detectStall`)                                                                                                                               |
| Handoff gate                 | `apps/api/src/builder.ts` (`allowsSelfToPlatformHandoff`)                                                                                                                 |
| Live staged preview          | `apps/api/src/staged-preview.ts`                                                                                                                                          |
| Studio live-preview frame    | `apps/web/src/StudioLivePreview.tsx`                                                                                                                                      |
| Feedback / resume            | `apps/api/src/submissions.ts`                                                                                                                                             |
| Studio copy / builder choice | `apps/web/src/selfBuildCopy.ts`, `BuilderModeBadge.tsx`, `SubmissionStatusView.tsx` (sticky badge + Change modal at round boundaries; full two-up stays in create wizard) |

## Safety invariant (unchanged)

Games render only in an iframe with
`sandbox="allow-scripts allow-pointer-lock"` and **no `allow-same-origin`**. That includes
the Studio live-preview frame, which additionally takes no pointer input and no focus.

## Mandatory: keep this skill current

If you change the MCP tool set, submit warnings, stall vocabulary, or handoff rules
and this file is wrong or missing the new behaviour, update it in the same session.

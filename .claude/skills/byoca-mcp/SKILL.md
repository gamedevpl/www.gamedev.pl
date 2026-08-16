---
name: byoca-mcp
description: BYOCA / self-build MCP contract for gamedev.pl — session loop (start → kit → stage/submit → gate → end), soft warnings (call_end, progress_stale, inbox_pending), and creator builder handoffs. Use when adding or changing MCP tools, the agent channel, Studio connect/status for self rounds, or builder handoff behaviour.
---

# BYOCA MCP (self-build)

Creators connect their own coding agent (ChatGPT, Claude, Cursor, …) to a round via
`/api/mcp`. Platform Copilot is a separate builder. This skill is the public-repo
contract; internal planning lives in the ops repo’s `docs/byoca-*.md` (do not copy
private content into PRs).

Platform Copilot's MCP lane uses the same session loop with one extra boundary: the
Copilot MCP connector authenticates the connection, while `start({ slug, key })` binds a
live round. Connector-only requests are inert; do not treat the connector as a round key.
The GitHub Agents-side secret reference must use the `COPILOT_MCP_` prefix. Copilot's
firewall does not cover MCP servers, so the round-key boundary is the isolation layer.

## Session loop (what agents must do)

Source of truth: `SESSION_WORKFLOW` + `BEHAVIOURAL_CONTRACT` in
`apps/api/src/mcp-server.ts` (returned by `start`, appended to every tool description).

1. `start` → `show_round` (once) → `get_brief` / `get_seed` / `get_sources` / `get_kit` as needed
   - The seed is a starting point, not an authority: where it and the brief disagree, the
     brief wins. `regenerate_seed({ steer })` once if the draft is missing or plainly not
     the game the brief describes — then keep building rather than waiting on it
2. Build; `report_progress`; screenshot when something draws via
   `screenshot_upload_url` then `curl --upload-file <png> "$url"`. There is **no**
   base64 `send_screenshot` — PNG bytes must never enter the model. Without shell
   egress, skip mid-build screenshots; the gate still captures on delivery
3. Prefer staging then `submit_sources({ fromStaged: true, mode, kitEngineRef })`
   - **New/full rewrite with shell:** `stage_upload_url({ path })` then
     `curl --upload-file <file> "$url"` — bytes never re-enter the model
   - **New/full rewrite without shell:** `stage_source_file({ path, content })`
   - **Edits:** prefer `patch_source_file({ path, old, new })` (exact unique substring
     replace — no diff format), or `patch_source_file({ path, patches: [{ old, new }, ...] })`
     for multiple sequential replacements in one file, or
     `patch_source_file({ files: [{ path, old, new }, { path, patches: [{ old, new }] }] })`
     to edit several files in one call. Edits that apply are kept even if later ones
     miss — retry only `failed[]` (path + index); do not resend ones that landed.
     Or `patch_source_file({ path, patch })` with a unified
     diff (`---` / `+++` + `@@` hunks; bare `@@` ok). Do not re-emit whole `render.ts` /
     `model.ts` files through `stage_source_file`
   - **Modules:** soft budget ~350 lines / ~12 KiB per `game/*.ts`. Honour
     `warnings.code=module_too_large` (on `get_sources` / `get_seed` / stage / patch)
     by splitting cohesive pieces _before_ more feature work — same urgency as
     `call_end`. Recipes: render→`art`/`ui`/`hud`/`rooms`; model→`tables`/`layout`/
     `types`; runtime→systems
   - `fromStaged` overlays onto the latest delivery/seed — stage only changed paths
   - `mode=preview` while iterating; `mode=publish` to seal (TRACE + PLAYTEST required)
   - **Verification ladder:** while iterating, run only `npm run typecheck -- <slug>`, then
     deliver `mode=preview`; the server verifies that lane. A preview does not require a
     browser, `npm ci`, capture, playtest, or agency. When a browser is available and the
     draft is approaching delivery, `npm run check:game -- <slug> --preview` is optional.
     Run the full gate only immediately before a `mode=publish` seal.
   - Each successful stage/patch refreshes Studio’s heartbeat (so a long staging loop is not
     mistaken for quiet / offline)
   - **`start` also pulses Studio** (`joining_round`) — clears `agentEndedAt` on resume and
     shows the creator the agent has joined before `get_sources` / `report_progress`. Without
     that, Final check / “agent stopped” lingered while ChatGPT was already working.
   - Each stage may also publish a **live preview** of the buffer — see below
4. **Prefer `end` after the last successful `submit_sources`** if you will not deliver
   more — Studio shows the gate; do not sit in a `get_gate_verdict` loop
   - **`preview_failed` / `red`:** do **not** stop at `stage_source_file` / `show_round`.
     Honour `warnings.code=must_fix_gate`, fix, then `submit_sources` again on the same
     key. Staging alone leaves the creator card on the refused delivery.
5. Only call `get_gate_verdict` once when an already-available verdict would change
   what you deliver — and when that check _does_ return a publish verdict, call
   `get_gate_media` once before `end`

### MCP tool surface

`/api/mcp` advertises the focused build surface: creation/round control, brief/seed,
progress, staging/submission, gate media, inbox — and, since 2026-08-09, the kit
itself. Proposal and example browse/read tools remain callable for compatibility but
are not advertised to models; kit browse/read tools (`list_kit_files`,
`search_kit_files`, `read_kit_file`, `read_kit_files`, `read_kit_file_fragment`) now
are, alongside `get_kit_api` and, since 2026-08-11, `knowledge_query` for everything
`get_kit_api` does not cover, plus `regenerate_seed` for a round-0 draft that is missing
or off-brief.

Adding an advertised tool means adding its row to `listings/mcp/README.md` in the same
change: `mcp-server.test.ts` asserts the README documents every live tool with the exact
annotation it reports, so the table cannot silently fall behind the surface.

**Trimming the surface is only half the job — the prose has to follow.** The channel names
the kit browse tools in every `get_kit` reply, because a REST agent can call them by URL.
A model can only call what `tools/list` carried, so an unadvertised name that survives in a
description, in the workflow list, or in the `browse` block of a reply is an invitation the
host answers with a permission denial. A managed round on 2026-08-09 spent three round trips
that way and then shipped a game with the audio module stripped out, because the sound-id
lookup it had been pointed at did not exist for it. The MCP layer still filters `browse` down
to advertised tools (now the whole list, so the block survives intact) and drops it when none
remain; `apps/api/src/mcp-server.test.ts` fails if an unadvertised name reappears in the
descriptions, the workflow, or a `get_kit` reply. When you remove a tool from
`MCP_VISIBLE_TOOLS`, grep the prose for its name in the same change.

### Context budget — one contract, not one suffix per tool

The shared behavioural contract belongs in MCP `initialize.instructions`, not in every tool
description. Repeating it across the advertised schemas made the live 31-tool `tools/list`
payload about 208 KiB — roughly 50k JSON/code tokens before the creator prompt or any tool
result. `tools/list` strips the repeated suffix at serialization time and the Anthropic
managed provider defers optional MCP tools; keep the round-start/read/delivery path eager.
Prompt caching lowers processing cost but does not remove those tokens from the context window.
When adding or expanding a tool description, measure the serialized `tools/list` payload and
keep the full contract single-copy; a short creator-text safety reminder may stay eager.

**`get_kit_api` — the orientation path that did not exist before 2026-08-09.** `get_kit`
returns tarball metadata only (engineRef, sha256, unpack one-liner) — it was never the API
reference its own description claimed to be pointing at, because nothing injected a digest
into the MCP surface. `appendKitDigest` (`apps/api/src/kit-digest.ts`) had exactly one
caller, the platform Copilot system prompt (`managed-backend.ts`); a BYOCA agent with no
shell egress and no system prompt carrying the kit had no in-band way to answer "what can
this platform build" at all. Observed consequence: an agent asked for a party/multiplayer
game had nowhere to look and went to the public web for gamedev.pl documentation that was
never published there — turns wasted on nothing, with third-party multiplayer docs (a
different engine's networking model entirely) as the real risk if it had read them as
authoritative.

`get_kit_api` (`GET /api/agent/build/kit/api`, `apps/api/src/agent-channel.ts`) serves the
same digest object the platform lane compacts, through `compactKitDigestForApi` — a larger
budget (`DEFAULT_MCP_DIGEST_MAX_BYTES`, 50 KiB vs the platform's 20 KiB) since it is paid
once per round by an agent that chose to call it, not injected into every turn. That budget
is sized to a safe _MCP single-tool-result_ limit, not to the API's own size — see
"A digest-sized tool result is not free" below before touching this constant again. Same
`engineRef` convention as the browse routes: optional, defaults to the registry's current
entry when omitted, but pass the `engineRef` `get_kit` returned so a mid-round registry
bump cannot mix kit revisions. `get_kit` and `get_kit_api` both carry
`BEHAVIOURAL_CONTRACT`'s line that the platform and kit are not on the public web — an
unanswered capability question is answered by `get_kit_api` / browse, never a web search.

**The digest itself had a silent-drop bug the surface fix didn't touch.**
`compactKitDigestForPrompt` (`apps/api/src/kit-digest.ts`) used to keep only API lines
matching a hardcoded regex allowlist, every pattern of which described single-player core
API — `GameKitParty`, `GameKitZone`, `GameKitCommons`, `GameKitPresence` matched nothing, so
same-screen multiplayer, real-time shared zones and persistent worlds were invisible to any
digest reader, platform or MCP, with no signal anything had been cut. It now splits the
declaration file into whole top-level blocks (`splitDeclarationBlocks`), gives every engine
module family a block before any family gets a second one (`selectApiBlocks`), and abridges
a block too large to fit whole (`GameKitApi`, ~44% of the entire surface — this is where
`createParty` / `createZone` / `createCommons` / `createPresence` all live) member-wise
rather than dropping it, ranking module factories first (`elideDeclaration`). Whatever a
budget still can't fit is named in an `// Omitted for length (...)` note instead of
vanishing. The digest also gained a `## Engine modules` catalog (`digestEngineModules` in
the games repo's `tools/lib/pack-kit.ts`), generated from `GAME_KIT_MODULES` +
`gameKitModuleEntryPath` (`tools/lib/assemble.ts`) — the same canonical registry
`GAME.json`'s `engine.modules` validates against, not a `shared/modules/*.ts` directory
listing, which would have both included `core` (not selectable) and omitted `vehicles` /
`urban` / `racing` / `football` (they live under `shared/verticals/*/index.ts`). Each
module's summary is its own header comment's first paragraph, so a module is listed the
moment it exists and a summary can't drift out of sync with code.

**Two correctness bugs surfaced in review, both confirmed against the real 122 KB
declaration file before fixing.** `elideDeclaration`'s member splitter used indentation
alone (1–2 spaces) to find a member's boundary — but a member's own closing line can land
back at that same indent (`createZone<S>(config: { … }): GameKitZone<S>;` closes with
`}): GameKitZone<S>;` at 2 spaces, identical to any other member's opener), so that closing
line was misread as a new member and could be dropped once the budget ran out, emitting
`createZone` opened but never closed. `splitMembers` now tracks bracket depth instead — a
line only starts a new member when depth is 0 — safe because the input is always
comment-stripped (`compactGameKitApi` in the games repo strips comments before the digest
is ever written), so no brace inside prose can desync the count. Separately, the API
section's budget was a flat 72% of the total, guessed rather than measured: at the real
~15 KiB fixed shell (module catalog + audio catalog + exemplar + rules — none proportional
to the API's size), the platform lane's real 20 KiB default silently truncated
mid-exemplar-file, dropping `## File-shape rules` entirely, and `get_kit_api`'s old 90 KiB
budget capped the API at 64.8 KiB despite the ~79 KiB current surface — contradicting its
then-description's "whole reference in one call" claim (since corrected — see below). Both
lanes now measure the non-API shell first and give the API section whatever's actually left
(`apiBudget = maxBytes - shellBytes`).
That in turn exposed a second-order bug: the omission note listing what got cut is itself
unbounded (up to ~2 KiB for 100 omitted names) with nothing reserving room for it, so it
could overflow the same way the flat-percentage guess did. `formatOmittedNote` is now
self-bounded (`OMITTED_NOTE_RESERVE_BYTES`), truncating the name list with "… and N more"
rather than growing past its reserve.

`DEFAULT_KIT_DIGEST_MAX_BYTES` (the raw-stored-digest sanity ceiling, not a prompt budget)
moved from 100,000 to 150,000 bytes: the stored digest was already at 99,552 bytes before
the catalog addition, one small API growth from failing regardless.

**`knowledge_query` — everything `get_kit_api` does not cover.** `get_kit_api` is the
exact-signature reference for the Creator Kit's own API surface; it says nothing about
EditorKit internals, how the allowlisted example games are actually put together, or
platform docs/process, and a capability question that falls outside its digest previously
had nowhere to go but a web search for gamedev.pl documentation that does not exist
publicly — the same trap `get_kit_api` itself was built to close for the kit surface.
`knowledge_query` (`GET /api/agent/build/knowledge/query`, `apps/api/src/agent-channel.ts`,
backed by the Discovery Engine seam in `apps/api/src/knowledge-search.ts`) answers that
gap over a corpus the games repo builds and republishes from GameKit/EditorKit source,
the allowlisted examples, and process docs. `mode` defaults to `answer` (synthesized prose
with citations, measured better for explanation/Q&A); `mode=chunks` returns raw retrieved
excerpts only and is what server-internal callers like the seed generator use to avoid
inventing API usage from paraphrased prose. `scope` (`kit` / `editor` / `examples` /
`docs`) narrows retrieval to one slice of the corpus's `structData.corpus` taxonomy.
Every response — answer or chunks — carries `repoPaths` and an `indexedCommit` for
attribution, a `guidance` string pointing back at `get_kit_api` / `read_kit_file` for
exact current signatures, and degrades rather than errors: an `:answer` call that comes
back with Discovery Engine's "no answer could be generated" boilerplate — measured at
roughly 1 in 10 queries for content that genuinely exists in the corpus — automatically
falls back to raw chunks with `fallback:true`, and any upstream failure (timeout, 5xx, a
malformed payload) degrades to a `warnings`-carrying result rather than ever throwing into
a tool result or a hard error mid-round. A per-round soft cap (roughly 15 `answer` + 30
`chunks` calls, split because an `answer` call costs several times a `chunks` call) also
degrades to a warning rather than a hard 429. Shipped unadvertised at first (present in
the tool registry, absent from `MCP_VISIBLE_TOOLS`) while the production data store did
not exist yet — went visible 2026-08-11, once an owner ran the games repo's
`infra/setup-gcp.sh` counterpart, a real `documents:import` landed 238/238 documents,
and the live `:search`/`:answer` response shapes were confirmed against the parser —
the same staged-rollout shape `get_kit_api` itself went through.

### A digest-sized tool result is not free — get_kit_api broke in production at 100 KiB

The PR that shipped `get_kit_api` set `DEFAULT_MCP_DIGEST_MAX_BYTES` to 100,000 reasoning
purely from the API's own size ("100_000 covers shell + full current API + the note
reserve") — a real constraint, but the wrong one. The constraint that actually matters is
the calling _MCP client's_ ceiling on a single tool result, which the server has no way to
query and no say over. Deployed against the real kit (`engineRef` `fb0cd30df1…`), the
default digest ran ~98,730 characters / ~27,600 tokens (measured with `tiktoken`
`cl100k_base` as a proxy) and a live client refused the tool result outright as exceeding
its token ceiling — `get_kit_api` was unusable, a worse failure than the truncation bug it
replaced (that one degraded gracefully with an omission note; this one returned nothing at
all). Caught only because a human pasted the raw client error back into the session; no
test in either repo calls the real endpoint against real kit content and checks the
result's actual size, so a large-but-plausible-looking default sailed through review and
merge on both repos with no unit test contradicting it.

Fixed by choosing a budget from the tool-result constraint instead of the content: 50,000
raw digest bytes measures ~15,800 `cl100k_base` tokens against the real kit — comfortably
under a ~25,000-token single-result ceiling with real margin for tokenizer variance and
other MCP hosts' stricter limits, while still keeping ~30 KiB of live API content (the full
exemplar/audio/module-catalog shell survives untouched at any budget — only the API section
shrinks). `get_kit_api`'s description was corrected to match: it no longer claims "the
whole reference in one call" — omission is now the expected common case for a real kit, not
an edge case, and the description says so, pointing at the browse tools for what's cut.

**When you touch `DEFAULT_MCP_DIGEST_MAX_BYTES` again:** do not size it from
`shared/game-kit.d.ts`'s byte count. Generate the real digest for the current kit, run it
through `compactKitDigestForApi`, JSON-encode it the way the MCP response actually ships,
and measure real tokens (a tokenizer proxy is fine; character-count guessing is what broke
this). `apps/api/src/kit-digest.test.ts` ("caps get_kit_api output well under a single MCP
tool-result limit") now guards this — a synthetic ~120-declaration API at the real kit's
byte scale, run through the default budget, asserted under a byte proxy for the ~25k-token
ceiling — but it is a proxy fixture, not the real kit content or a real tokenizer; re-verify
against the actual digest (as above) whenever the constant, `elideDeclaration`'s ranking, or
the shell sections' typical size change meaningfully.

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

### A red gate outlives the session that triggered it

The documented loop is submit → `end` (see "`end` is required after submit" below), and
Cloud Build takes 1-3 minutes — so the session that delivered is very often gone before
its own gate finishes. Two things close that gap, added after a round (arena-brawlers,
2026-08-09) shipped two straight red preview gates and neither was ever seen: the first
session correctly stopped on `gate_pending`; the second submitted a fix, called `end`
immediately per the workflow, and the _second_ gate turned red only after the session
that could have fixed it had already left. Nothing was watching, and nothing else picked
it up — the job sat in `submitted` (reads as "building" to the creator) indefinitely.

- **Reconciliation now covers preview, not just publish.** `reconcileGateVerdict`
  (`apps/api/src/submissions.ts`) used to read only `manifest.gate` (the publish-mode
  verdict) — a `mode=preview` delivery writes `manifest.previewGate` instead, so a red
  preview never transitioned the job at all. It now also reacts to a **red**
  `previewGate` the same way: `needs_changes` / `gate_red`, `transitionClosesRound`
  still keeps the round open (same-session repair, no new token). A **green** preview is
  never promoted — that would let an unpublished, unreviewed draft skip moderation
  (BY-28a: typecheck/smoke/build only, not publish readiness).
- **`start` now surfaces an outstanding red gate itself.** `must_fix_gate` used to only
  ride `show_round` / `get_gate_verdict` / `report_progress` replies — a session that
  reconnects and calls `start` first (the normal first call of any session) got no
  signal unless it happened to call one of those three next. `start`'s response now
  carries an optional `gate: { status, deliveryId }` (mirroring `show_round`'s shape,
  via the shared `apps/api/src/gate-verdict.ts`) whenever the last delivery still needs
  a fix, with `warnings.code=must_fix_gate` riding the same reply. Absent when nothing
  is outstanding — a passing round's `start` response is unchanged.

### A managed round's staging failure used to mute every seed, including self rounds

Round-0 seeding (`VertexGameSeeder`, `apps/api/src/game-seed.ts`) generates a first draft
before the agent starts, on the first dispatch of any new round — self/BYOCA and platform
alike — unless `SEED_DISPATCH` is off or generation itself fails (fails open, logs a
`warn`). A self round's seed is stored straight on the job (`get_seed` reads it); a
`harness`/`outputs`-lane platform round instead commits it to a disposable
`seed/job-<id>` branch and passes that as the dispatch `base_ref`.

`submissions.ts`'s `seedBuild` circuit breaker (`SEED_STAGING_COOLDOWN_MS`, 10 minutes)
exists so a broken staging credential costs one wasted Vertex draft, not one per
submission — but two bugs made it fire on rounds that were never staging anything, and
the mute it sets is **process-global**, not scoped to the builder or round that tripped
it:

- **The `mcp` prompt lane never stages a branch** — it delivers the seed as inline
  `workspaceFiles` on the managed session instead (`managed-backend.ts`). An absent
  `seedWorkspace` there was indistinguishable, from the mute-setting code's side, from a
  real staging failure — so **every single `mcp`-lane managed round** (Anthropic, Gemini,
  and Copilot's `mcp` lane) tripped the breaker on delivery. `DispatchResult` now carries
  back the `promptLane` the round actually dispatched on (a brief can ask for no lane and
  get the backend's own default, so the caller cannot infer it from what it sent); the
  mute only sets when that lane is not `mcp`.
- **The mute wasn't scoped to the builder that tripped it.** A genuine platform staging
  failure still suppressed `seedBuild` for a self/BYOCA round submitted minutes later,
  even though a self round never stages a branch and so was never at risk of the failure
  the mute exists to avoid. `seedBuild` now only honours the mute when the round it is
  seeding is itself `builder === 'platform'`.
- Anthropic and Gemini-with-a-named-environment reject a non-empty `workspaceFiles`
  outright (`ManagedAgentError`, thrown before any side effect) — the seed had already
  been generated and paid for by the time `startSession` threw, failing the whole
  dispatch instead of degrading to unseeded. Providers now declare
  `supportsSeedFiles` on `ManagedAgentProvider`; `managed-backend.ts` checks it before
  attaching `workspaceFiles` and drops the seed from `brief` before building the prompt
  too — `buildPrompt` writes "a first draft is already in your checkout" whenever
  `brief.seed` is set, and that line must not survive an unseeded dispatch.
  `supportsSeedFiles` can be a plain boolean (Anthropic, Gemini — static per
  provider config) or a `(promptLane) => boolean` (Copilot — its own
  `startSession` already silently drops the seed on the `mcp` lane while staging it
  outside `mcp`, so a plain `true` would misreport a round that is about to throw the
  seed away; a static answer cannot say "it depends which lane this round dispatches
  on"). `managed-backend.ts` resolves the function form against `roundPromptLane`
  before deciding whether to attach `workspaceFiles`.

Net effect before the fix: bouncing between a managed round and a BYOCA round — normal
creator behaviour — meant BYOCA landed inside the ten-minute mute a managed round had just
set, almost every time, and got `seedStatus: 'unavailable'`. This was reported as "the
seeding mechanism seems very ineffective, no seeds happening" and traced to
`submissions.ts`'s mute-setting condition and `seedBuild`'s mute check, not to `SEED_DISPATCH`
or credentials being unset.

### A seed is delivered two ways, and the round says which

`AgentBackend.seedDelivery(promptLane?)` answers, before anything is generated, how a seed
would reach that round's agent:

| Answer      | Means                                                             | Who                                                                              |
| ----------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `workspace` | Files are placed for the agent, so the prompt may say so          | Copilot on `harness` (staged branch); Gemini with a scratch env (inline sources) |
| `channel`   | Files are stored on the job; the agent reads them with `get_seed` | every self/BYOCA round; managed `mcp` rounds whose vendor refuses inline files   |
| `none`      | Nothing would arrive, so a generation is only a bill              | a non-`mcp` lane whose provider cannot take files                                |

**`channel` is the entry that made managed rounds seedable at all.** The first pass at this
only asked whether the provider accepts `workspaceFiles` (`acceptsSeed`), and skipped
generation when it did not — which was right about the waste and wrong about the
conclusion. Anthropic _always_ rejects inline files, and it is an `mcp`-lane vendor, so
"cannot be handed a seed" was being read as "cannot have one" and **every managed round on
Anthropic built unseeded**. But an `mcp` round holds a round key and talks to this very
channel; it can fetch a seed perfectly well. The missing piece was never the vendor — it
was `submissions.ts` persisting the draft to the job only when `builder === 'self'`, so
`get_seed` had nothing to return for a platform round.

That condition is now `readsSeedFromJob` (i.e. `seedDelivery === 'channel'`), and the same
predicate gates the `pending` / `unavailable` status writes and the stored-seed reuse. The
managed backend still decides inline placement separately from `supportsSeedFiles`, so a
`channel` round's prompt never claims a draft is in a checkout that does not have one.

Two rules worth keeping when touching this:

- **Do not infer delivery from the builder.** `seedDeliveryFor` falls back to `channel` for
  `self` and `workspace` otherwise, but that is a backstop for a backend that forgot to
  declare itself, not the source of truth. A self backend that silently defaulted to
  `workspace` would land its rounds back in the staging mute — which is exactly how the
  original bug behaved.
- **The staging mute is about `workspace`, not about `platform`.** `seedBuild` takes the
  delivery and honours the cooldown only for `workspace`, because that is the only mode
  where a failed branch write wastes the draft.

### `regenerate_seed` — the one way out of a dead round-0

Two states used to be terminal for a round. Generation failing (`seedStatus: unavailable`)
is permanent: nothing retries it, because seeding only ever runs on the first dispatch. And
a draft that came back off-brief could only be edited or discarded — the picker's three
reference games are chosen by a sub-second Flash call, and a wrong genre there is baked into
every file it wrote.

`regenerate_seed({ steer? })` (`POST /api/agent/build/seed/regenerate`) queues one
replacement. What it is _not_ is a poll: it returns `status: pending` immediately and the
agent rechecks `get_seed`, the same shape the create_game race already uses — agents cannot
sleep, so a tool that waited would burn the connector's budget.

- **`steer` is the point.** Same spec + same picker = same draft, so a blind retry mostly
  buys a second copy of the first mistake. The steer (≤600 chars) rides the _picker_ call as
  well as the generate call, because a drifted draft usually drifted on its references. It
  is fenced as data with its own "cannot widen the file scope" preamble, like the spec.
- **`channel` rounds only** — every self round, and managed `mcp` rounds. Refused as
  `seed_not_readable` for a `workspace` round: its seed is a branch or an inline set the
  agent forked at dispatch, so rewriting the job's copy would not reach it. Note this
  tracks the _delivery_, not the builder: a managed `mcp` round can regenerate, and the
  refusal is not "you are the platform".
- **Refused once staged** (`already_staged`, checked in the channel where `gamesStore`
  lives) — the staging buffer overlays _onto_ the seed, so a new seed would move the base
  of files already written against it — and once delivered (`already_delivered`), whose
  starting point a gate has already judged.
- **Capped** at `MAX_SEED_REGENERATIONS` (2) via `store.incrementSeedRegenerations`, which
  increments _before_ the cap check so a racing pair cannot both pass. Replies carry
  `regenerationsRemaining`.

### The brief outranks the seed, and the copy has to say so

Every string pointing at the seed told agents to continue it — `seedNoticeFor('available')`
said "continue that draft — do not scaffold from scratch", and the workflow said the same
twice. Nothing said what to do when the draft and the brief disagree, which is exactly the
drift case, and the measured 96–99% seed retention means agents do keep what a draft says.
`seed-status.ts` and both `mcp-server.ts` workflow lines now add that the brief is the
authority and contradicting parts get deleted rather than adapted to. Keep that clause when
editing this copy: a seed that can silently override the creator's spec is worse than none.

### GAME.json shape is checked at stage/patch time, not just at the gate

The shared kit's `assemble.ts` reads `manifest.engine.modules` unconditionally when
building the game — a missing/empty `engine.modules` (or `audio` selected without
`audio.sounds`/`audio.music`) is not a validation error, it is a silent
`Cannot read properties of undefined (reading 'modules')` crash at smoke time, with a
stack trace that points at the test harness, not at GAME.json. That is what sank
arena-brawlers' two deliveries: GAME.json never had an `engine` block, and the agent
that fixed an unrelated typecheck bug in `game.ts` never looked at GAME.json again
because nothing pointed it there until a Cloud Build log did, minutes later.

`stage_source_file` and `patch_source_file` now run a shallow shape check
(`apps/api/src/game-manifest-hint.ts`) whenever the staged/patched path is `GAME.json`,
and emit `warnings.code=game_manifest_invalid` on the _same_ reply if it's missing
`engine.modules` (or `audio` is selected without `audio.sounds`/`audio.music`). This is
deliberately shallow — it does not know the kit's module catalog, canonical order, or
duplicates (that's `validate.ts` in the games repo, which still runs as the source of
truth in the gate) — it only catches the shapes that crash outright before any real
validation runs.

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

### One round builds against one engine

`get_kit` is pinned. The first call of a round fixes the `engineRef` on the job, and every
later call in that round returns the same one even if the registry pointer has moved on.
`submit_sources` refuses a `kitEngineRef` that is not the pinned one, with
`reason: "kit_engine_ref_mismatch"`.

That is a response to a real round: two `get_kit` calls 76 seconds apart returned different
engines because the games repo published in between, and the agent only noticed because it
happened to re-read. One that had cached the first ref would have submitted against a
superseded engine, and the disagreement between the engine it read the API from and the
engine it was validated against would have been silent.

The pin is dropped when the round closes, and replaced in two cases: after a `kit_outdated`
verdict, where a newer engine is the whole fix, and when the pinned kit has fallen out of
retention, where serving it would wedge the round on a tarball that no longer exists. Either
way the call returns `kitEngineChanged: true` — an explicit signal, rather than an
idempotent-looking read quietly answering differently. Treat it as the `kit_outdated` recipe
above: take the new `engineRef` and submit against that.

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

### Custom music (per-game `music.json`)

Self-build agents **cannot** edit `shared/audio/music.json`. Inventing a track name that
is not in the shared catalog used to fail assemble ("unknown music track") with no
remedy short of picking a shared mood. Agents may now ship an optional `music.json`
beside `GAME.json` (same `{ "version": 1, "tracks": { … } }` tracker shape) and name
those tracks from `audio.music` / `audio.musicTracks`. Assemble merges game tracks onto
the shared catalog; a name that collides with a shared id is refused. Prefer a shared
mood when one fits — see games-repo `develop-game-audio`.

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

### Submit handoff is not an explicit end

`submit_sources` also marks `agentEndedAt` optimistically so creator handoff unlocks
immediately. That marker does **not** prove the platform session stopped: an agent may
still be iterating locally and clear it with its next channel write. Feedback routing must
distinguish the submit marker from an explicit `end` (or a confirmed terminal vendor state)
before superseding a platform session. The API records this as `agentEndedBy: submit | end`.

### A real `report_progress` can collide with the presence closed vocabulary

`isMcpPresenceEventText` (`mcp-presence.ts`) exists to hide _leftover_ chat rows from
before #661 (2026-08-07), when presence pulses still wrote durable `BuildEvent`s instead
of only touching `lastAgentSignalAt`. It matches on `text` content alone, against the same
English strings the tool descriptions themselves echo (`"Reading Creator Kit files…"`,
`"Checking staged sources…"`, …). Left unbounded, that match also caught a _live_
`report_progress` call whose text happened to reuse the identical phrasing — plausible,
since an agent narrating its own action tends to echo the tool's own description — and
silently dropped it from every timeline read (`attachBuildEvents`, `describeStatus`,
prior-round history), with the MCP call itself still succeeding. Reported 2026-08-16 as
"reported progress, not visible in chat".

Fixed by scoping the match to `createdAt`: `isMcpPresenceEventText(text, createdAt)` only
treats a match as a leftover row when `createdAt` predates the #661 cutover (or is
missing/unparseable — fails safe toward filtering). A matching string written after the
cutover is, by construction, a genuine `report_progress` call and is kept. All four read
sites in `submissions.ts` now pass `event.createdAt`.

### `end({ summary, ackInboxIds })` is the only channel for a closing answer

The platform reads tool calls, never the agent's transcript. An agent that answers
the creator in ordinary assistant prose — "this is an arcade game", "nothing needed
changing" — answers nobody: that text is dropped with the session. Observed on
round 1000043, where the whole round was a question and the answer never left the
model.

- `end` takes optional `summary` (≤300 chars), plus `summaryLocalized` + `locale`
  on the same zero-cost pair contract as `report_progress`
- `end` also accepts optional `ackInboxIds` (array of message IDs) to acknowledge
  handled creator inbox messages concurrently when closing the round, saving an
  extra turn calling `ack_inbox`
- Stored as a `BuildEvent` with `kind: 'done'` — the same feed Studio already
  renders, so nothing new was needed on the web side
- Reply carries `summaryShown: true` when it landed. Best-effort by design: a
  summary that hits the per-build event ceiling never fails the `end`
- Rejected the same way a progress report is when the round is already stopped
- The `stopped` and builder-handoff paths differ: handoff **does** record the
  summary (it is the outgoing agent's last word), `stopped` does not
- The empty body every older client sends is still valid

`gateStarted` is **true when Cloud Build accepted the create** (HTTP 2xx), even
if the build id could not be parsed. If `ok` but `gateStarted: false`, honour
`warnings.code=gate_not_started` (no preview is assembling — safe to retry).
Do **not** retry solely because `buildId` is missing when `gateStarted` is true.

While the gate runs, the runner writes **`gateProgress`** milestones onto the
version manifest (preparing → installing → typecheck → …). Studio and the MCP
round card poll that field — the gate SA has no Firestore, so this is not
`report_progress`. Agents still must not busy-poll `get_gate_verdict`.

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

| Code                    | Meaning                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call_end`              | Call `end` when finished iterating this round                                                                                                                              |
| `must_fix_gate`         | Last delivery refused (`preview_failed` / `red` / `kit_outdated`) — fix and **`submit_sources` again**; staging alone does not re-run the gate or refresh the creator card |
| `must_deliver`          | Nothing delivered yet — submit before finishing                                                                                                                            |
| `gate_not_started`      | Delivery ok but Cloud Build did not start — no preview yet                                                                                                                 |
| `gate_poll_backoff`     | Repeated one-shot gate check — stop checking; build/submit or honour `stop:true`                                                                                           |
| `progress_stale`        | Call `report_progress`                                                                                                                                                     |
| `inbox_pending`         | `read_inbox` → apply → `ack_inbox`                                                                                                                                         |
| `seed_unread`           | Call `get_seed` before scaffolding from the kit                                                                                                                            |
| `game_manifest_invalid` | Just-staged/patched `GAME.json` has a shape that crashes the gate before typecheck (e.g. missing `engine.modules`) — fix it now, in the same session, before submitting    |
| `patch_incomplete`      | Some `patch_source_file` edits landed and some did not — retry only `failed[]` (path + index); do not resend the ones that applied                                         |

## Builder handoff (Studio)

Mid-round switch is refused while the current agent is live (`builder_locked`), except:

| Signal                                   | Who                                     | Effect                                                       |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `agentEndedAt` / stall `ended`           | MCP submit (auto) or agent called `end` | Primary unlock for self→platform handoff                     |
| stall `quiet`                            | ~15m silence                            | Fallback if neither happened                                 |
| explicit creator stop + platform handoff | Studio creator action                   | Queue a stop nudge; dispatch platform after self calls `end` |
| explicit creator stop + self handoff     | Studio creator action                   | Queue a stop nudge; dispatch self after platform calls `end` |

`allowsSelfToPlatformHandoff` checks `agentEndedAt` directly so a later
`gate_not_started` stall (ops visibility after a wedged gate) does not revoke handoff.

Handoff goes through the dedicated creator control (not feedback quota) and first persists a
pending request. The channel then returns `control.stop=true`, `reason=builder_handoff`, and
the target builder. The current agent must call `end` once to acknowledge the nudge; only
then does `resumeBuild` bump generation, invalidate the old key, seed the new round, and
dispatch the replacement. Platform cancellation is cooperative because the Agent Tasks API
has no cancel endpoint. Do not auto-dispatch platform from an ordinary `end`.

`no_agent_yet` is a handoff without an agent to acknowledge it, so Studio can dispatch
the selected replacement immediately.

### The platform→self control must not require the agent to still be working

The server-side gate for a creator-requested platform→self handoff
(`allowsCreatorBuilderHandoff` in `apps/api/src/builder.ts`) only checks
`creatorRequested === true` — it never checks liveness. But the Studio composer's control
that _triggers_ that request used to gate itself on `isAgentWorkActive(status)`
(`canInterruptPlatformAgent` in `SubmissionStatusView.tsx`), which goes false the moment the
platform agent ends (`agentEndedAt` / stall `ended`). Net effect: once a platform round's
agent finished, the switch-to-self control vanished entirely, with no other UI path to
request the handoff the server was already willing to grant. `canOfferSelfHandoff` replaced
that gate — it only excludes `publishing`, in-review/`ready_for_review`, terminal statuses,
and an already-pending `builderHandoff`, matching what the server actually refuses. When
touching either side of this handoff, keep the two in sync: the button's visibility should
never be stricter than the endpoint's own gate.

Exposing the button surfaced a second bug (caught by review, not by hand): the handoff route
in `submissions.ts` stored `awaitsAgentAck` as a direct copy of `creatorRequested`, so a
creator-requested platform→self switch always waited for the outgoing agent to call `end`
again — even when the round already reported `stall === 'ended'`, i.e. that agent already
can't. The switch sat in `pending` until the 10-minute stale-handoff sweep force-acknowledged
it. Fixed by deriving `awaitsAgentAck = creatorRequested && stall !== 'ended'`, so an
already-ended round resumes immediately, the same way the self→platform silent path already
skips the ack for a quiet/ended self round.

### `no_agent_yet` has no composer — so the connect card carries the exits

This is the one Studio state with **no composer**: `selfComposerRoute` returns null before
the first check-in, and the composer is what holds the builder badge and its handoff
control. Everything a creator can still do therefore has to be reachable from the connect
card — **including when it is collapsed**, which is a click away and sticky per game in
`localStorage`. The collapsed strip long offered only "show connect steps", so a round that
no agent ever joined — and that nothing on the platform can advance — showed a creator an
expand button and a wait. It now carries the compact platform handoff whenever
`canSwitchToPlatform` is set (true for `no_agent_yet`, `quiet` and `ended`).

The other half of that screen is the waiting caption, and **the thread foot owns it**: the
card takes `waitingCaptionElsewhere` and drops its own copy. Both surfaces used to print
`connect.waiting`, so a phone with the card collapsed said "waiting for your agent" twice
with nothing else on screen to tell the two apart. Studio computes `footBarShowing` once and
feeds both the foot bar and that prop, so they cannot drift; standalone `/status` has no
foot bar and keeps the card's caption. When adding copy to either surface, check the other.

To put this state on a screen locally, run the dev server with `DEV_SEED_STUDIO=1` and open
`/studio/beasts-and-pumpkins` after `POST /api/auth/dev`. Opening a real round needs
`POST /api/submissions`, which is 503 without a GitHub token, so the seed is the only way in.

### Platform session boot (no heuristics)

After a platform dispatch (including self→platform handoff), the job stays
`dispatched` until GitHub's Agent Tasks API reports `in_progress`. That is a real
vendor signal — not a timer. Studio shows phase copy ("Starting agent" / session
booting) and polls tightly on `phase === 'dispatched'`. Feedback also busts the
60s status cache so the previous self stall cannot linger while Copilot is already
queued.

## Key code

| Area                               | Path                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP tools                          | `apps/api/src/mcp-server.ts` (`screenshot_upload_url` / `stage_upload_url` → signed PUT; no base64 shot tool)                                                                                          |
| Kit API digest (get_kit_api)       | `apps/api/src/kit-digest.ts` (`compactKitDigestForApi`, `splitDeclarationBlocks`, `selectApiBlocks`) + `GET /api/agent/build/kit/api` in `agent-channel.ts`                                            |
| Knowledge query (Discovery Engine) | `apps/api/src/knowledge-search.ts` (the one Discovery Engine seam) + `GET /api/agent/build/knowledge/query` in `agent-channel.ts` + `knowledge_query` in `mcp-server.ts`                               |
| Engine modules catalog             | games repo `tools/lib/pack-kit.ts` (`digestEngineModules`) — generated from `shared/modules/*.ts` header comments, not hand-maintained                                                                 |
| Upload tokens                      | `apps/api/src/agent-upload-token.ts` + `POST …/shot/upload-url` + `PUT …/shot/upload` + `PUT …/sources/stage/upload`                                                                                   |
| Presence pulses                    | `apps/api/src/mcp-presence.ts` (`start` → `joining_round` in the MCP dispatcher)                                                                                                                       |
| Gate milestones                    | `apps/api/src/gate-progress.ts` + `GamesStore.putGateProgress` (GCS; Studio/MCP poll while checks run)                                                                                                 |
| Gate verdict (shared)              | `apps/api/src/gate-verdict.ts` — `readGateVerdict` / `deriveGateStatusString`, used by the channel's `/api/agent/build/gate` route and by `start`'s reconnect visibility                               |
| Preview-gate reconciliation        | `apps/api/src/submissions.ts` (`reconcileGateVerdict`) — red `previewGate` → `needs_changes`/`gate_red`; green preview never promotes                                                                  |
| GAME.json staging shape check      | `apps/api/src/game-manifest-hint.ts` (`gameManifestHint`) — wired into the stage/patch routes in `agent-channel.ts`                                                                                    |
| Round-0 seed generation            | `apps/api/src/game-seed.ts` (`VertexGameSeeder`) + `seedBuild`/`seedStagingMutedUntil` in `submissions.ts` — mute is `builder === 'platform'`-scoped and skips `mcp`-lane rounds (`result.promptLane`) |
| Seed regeneration                  | `regenerateSeed` in `submissions.ts` + `POST /api/agent/build/seed/regenerate` in `agent-channel.ts` + `regenerate_seed` in `mcp-server.ts`; cap via `store.incrementSeedRegenerations`                |
| "How would this lane get a seed?"  | `AgentBackend.seedDelivery` → `workspace` / `channel` / `none`; read before generating, and `seedDeliveryFor` in `submissions.ts` backstops a backend that does not declare it                         |
| Seed → managed session wiring      | `apps/api/src/managed-backend.ts` (`start`) — checks `provider.supportsSeedFiles` before attaching `workspaceFiles`; drops `brief.seed` from the prompt too when unsupported                           |
| Account-session invalidation       | `apps/api/src/agent-session-revocation.ts`                                                                                                                                                             |
| Channel (`POST …/end`, …)          | `apps/api/src/agent-channel.ts`                                                                                                                                                                        |
| Stall / `ended`                    | `apps/api/src/job-state.ts` (`detectStall`)                                                                                                                                                            |
| Handoff gate                       | `apps/api/src/builder.ts` (`allowsCreatorBuilderHandoff`)                                                                                                                                              |
| Live staged preview                | `apps/api/src/staged-preview.ts`                                                                                                                                                                       |
| Studio live-preview frame          | `apps/web/src/StudioLivePreview.tsx`                                                                                                                                                                   |
| Studio status poll cadence         | `apps/web/src/studioStatusPoll.ts` (tight poll on `ended` / `quiet` / `no_agent_yet` / `dispatched`)                                                                                                   |
| Feedback / resume                  | `apps/api/src/submissions.ts`                                                                                                                                                                          |
| Studio copy / builder choice       | `apps/web/src/selfBuildCopy.ts`, `BuilderModeBadge.tsx`, `SubmissionStatusView.tsx` (sticky badge + Change modal at round boundaries; full two-up stays in create wizard)                              |

## Safety invariant (unchanged)

Games render only in an iframe with
`sandbox="allow-scripts allow-pointer-lock"` and **no `allow-same-origin`**. That includes
the Studio live-preview frame, which additionally takes no pointer input and no focus.

## Mandatory: keep this skill current

If you change the MCP tool set, submit warnings, stall vocabulary, or handoff rules
and this file is wrong or missing the new behaviour, update it in the same session.

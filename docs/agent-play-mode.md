# Agent play mode — the design

> Status: 🚧 **implementation spike (2026-09-13).** The bridge, the reviewer gate, policy
> scripts, the plan runner, the filmstrip, the panel and the entry points are built and
> tested, and so is sound as readable text and hidden-field redaction, in the games repo's
> own assembly and in the documents this site serves.
> Reviewer traffic
> leaves no trace: an agent-capable session is kept out of the play funnel. Strategy and the decisions
> behind all of this live in the private ops repo (`agent-play-mode-research.md`).

## The problem

An AI agent driving a browser — Grok Bot, Claude in Chrome, the Operator/Mariner class —
sees a canvas game through screenshots taken every second or two, and presses keys through
an OS input layer whose timing it does not control. A 60fps game moves 60–180 frames
between two of its looks. So it cannot follow motion, cannot hold a key for a known number
of frames, cannot use a gamepad or a touchpad at all, and hears nothing.

The games repo solved this for CLI agents: `npm run play -- <slug> --text` is a line
grammar over a `node:vm` sandbox where **time only advances when the client asks**. The
live site offered nothing equivalent, so an agent asked to review a published game was
reduced to guessing from stills.

## The shape

A theater overlay a reviewer opens from the player's overflow menu, or with `?agent=1`.
It works at three altitudes: **a policy** to play, **a plan** to pin a sequence down, and a
command box for finding your feet first. Four rules carry the design:

1. **Time belongs to the agent.** Entering the mode pauses the game; `step 5` advances five
   frames, `press right 12` holds a key across twelve, `play 500` runs live for half a
   second and re-pauses, `live` hands time back. A screenshot taken between two commands is
   therefore consistent with the text beside it.
2. **One grammar, two surfaces.** The verbs are the games repo's, copied verbatim, plus the
   three only a live page can offer (`play`, `live`, `screenshot`). An agent briefed for the
   CLI harness is briefed for the page.
3. **Everything the agent reads is text in the host DOM** — state, the game's own
   description of the screen, clickable widgets, an event log. DOM-reading agents read it
   directly; screenshot agents read it as monospace text next to the canvas.
4. **Everything the agent sends executes inside the game document**, as synthetic keyboard
   and pointer events on the canvas, with frame-counted holds. No OS input timing involved.

## How it is put together

| Piece                          | File                                          | Role                                                                                             |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Grammar, formatting, redaction | `apps/web/src/agentPlay.ts`                   | Pure and typed; parses a line into a command, formats state, hides declared fields               |
| The plan language              | `apps/web/src/agentPlan.ts`                   | Parses and bounds a `CAPTURE.json`-shaped plan; evaluates its conditions                         |
| The runner                     | `apps/web/src/agentPlanRunner.ts`             | Drives the plan over the bridge, collects trace, checks and captures                             |
| The policy runner              | `apps/web/src/agentPolicy.ts`                 | Sends a `playAgent` function into the frame and brings back its transcript                       |
| In-frame executor              | `packages/contract/src/agent-play-bridge.ts`  | A source fragment concatenated into the player bridge; runs the verbs against `__GAME_HARNESS__` |
| Host state                     | `apps/web/src/useAgentPlay.ts`                | Sends commands, validates what comes back, folds in the game's play signals                      |
| The panel                      | `apps/web/src/AgentPlayPanel.tsx`             | The rail an agent reads and types into                                                           |
| Entry points                   | `apps/web/src/GameTheater.tsx`                | Overflow-menu item, `?agent=1`, per-tab memory                                                   |
| The gate                       | `apps/api/src/community/agent-play-routes.ts` | Serves the executor to a reviewer session, 404 to everyone else                                  |
| The fetch                      | `apps/web/src/useAgentBridge.ts`              | Asks for it; the answer, not the session hint, decides the mode exists                           |

The bridge fragment is not a module: it is a string, executed as an inline `<script>` inside
the game's opaque-origin document, which is the only vantage point that can reach the
canvas, the key listeners and the harness. `agentPlayBridge.test.ts` runs that real script
in jsdom against a stand-in game, because nothing else type-checks or executes it.

### Why stepping works

The player bridge's pause holds the game's `requestAnimationFrame` callbacks;
`harness.step()` calls the game's `update` directly and is not gated by that. So the game's
own loop stops while stepped time keeps moving. The pause veil is suppressed in this mode
(`setPaused(next, { veil: false })`) — otherwise every screenshot would be a dimmed frame.

### Pointer coordinates

Commands use 0..1 of the canvas **bitmap**. GameKit maps a client point into the
letterboxed bitmap area (`mapClientToBitmap` in the games repo `shared/modules/input.ts`),
so the bridge inverts exactly that, rather than scaling against the element box — those two
differ on every game whose canvas does not fill its container.

### What the agent gets for free

`progress`, `score`, `end` and `error` are messages the bridge has always posted for
telemetry. Agent mode folds them into its log, so the game's own landmark events show up
frame-stamped without a single change in the games repo. The same goes for `#game-status`,
GameKit's `aria-live` line: the one text channel a published game already writes to.

### Hearing the game

An agent has no audio track, so a game whose only feedback is a sound is unreviewable to
it. GameKit now records every `play`, `loop`, `playMusic` and `stopMusic` into
`harness.audio` — its own log, locally, reported to nobody — and the bridge reads them
from inside the frame into the same log, as `sfx`, `loop` and `music` lines. Its own log
rather than the existing `signals` array, because a sound-heavy run would otherwise evict
the `progress` landmarks that playtest tooling reads. Repeats inside a frame
collapse into a count, and a call for a sound the bundle does not carry is marked
`(missing)`, which is a finding rather than a silence. Each line keeps the frame the sound
happened on, not the frame the drain ran on — otherwise a `step 60` would file sixty
frames of sound under frame 60 and the log would be useless for finding which input
caused what.

The cursor is the entry's own sequence number, never its index. The signal log is capped
and drops its oldest entries to make room, so once it is full its length stops changing —
an index cursor parked at that length sits at the end forever and the session goes deaf
after the first 400 sounds. A sequence is monotonic across the page, so a rotation drops
a prefix and nothing else. Losing what fell out is the right way round: a sound reported
twice would read as a sound heard twice.

## Invariants this must not break

- **The sandbox stays exactly as it is.** `sandbox="allow-scripts allow-pointer-lock"`, no
  `allow-same-origin`, and `allow` never gains `tools`. Agent mode adds one message family
  to a bridge that was already hostile in both directions; it adds no capability to the
  game.
- **Game-authored text is data, never instructions.** State, observation and widget labels
  are written by an AI-generated game. The panel renders them as text, caps them, and says
  so in the guide it hands the agent.
- **Hidden answers are redacted in the frame, not on the host.** The fields
  `__GAME_AGENT_HIDDEN__` names are dropped before anything crosses the bridge, so a hidden
  answer never reaches the host at all. Redacting only at render would have put it on the
  wire and into React state first. The frame learns the list from
  `window.__GAME_AGENT_HIDDEN__`, which `assembleGameHtml` writes ahead of the game's own
  code from the `AGENT.json` the catalog read carries. A game that declares none still
  reports `hiddenFields: null`, and the panel says so out loud.
- **The list covers structured values at any depth; text is never inspected.** A value the
  game hands over as an object or array is serialized here in one pass, dropping declared
  keys wherever they sit and stopping if the output would exceed its cap. A **string** is
  treated as text: capped and passed through unread. That is the whole rule, and it is
  deliberately narrow — the earlier design parsed game-authored text to look inside it, and
  every shape of that parser grew another way around itself (JSON as a string, a leading
  BOM, a cloned graph, a thrown message). So: hand the platform a value, not a string.
  `defineGame().observation()` and `.agentApi()` do exactly that. If a game formats its own
  answer into prose, a pre-stringified blob or an exception message, redaction cannot see
  it — which is the same position prose was always in.
- **A value that converts itself is withheld.** `JSON.stringify` calls a custom `toJSON`
  _before_ the replacer sees it, so an object can hand back a different shape and carry a
  declared key out under another name. When a game declares hidden fields, a value with its
  own `toJSON` is withheld rather than trusted; `Date` is the exception, since its
  conversion cannot rename anything. A game declaring none is unaffected.
- **A helper that throws is reported without its message** when the game declares hidden
  fields, since the message is game-authored text under the rule above.
- **A policy is exempt, by construction.** It runs in the game's own realm and can read
  `__GAME_HARNESS__.metadata` directly, so redaction bounds what we hand it, not what it
  can reach. Claiming otherwise would be a fiction, and no record comes from this surface.
  `agent.call` returns the helper's value to the policy unredacted for the same reason —
  filtering there would break real helpers while changing nothing about what a policy can
  already read. What is redacted is the note that call writes to the log, because that is
  what crosses the bridge.
- **Synthesized input is released when the mode closes.** A `keyDown` with no `keyUp`, or a
  policy that threw mid-`press`, would otherwise hand the next human a stuck key.
- **An agent-capable session stays out of the play funnel.** `trackPlay` is off wherever
  the mode is available, so stepped time and synthesized input never land as progress,
  scores, endings or play time.

## The reviewer gate

The mode is for reviewers, and the gate is the server's, not the client's.

**The executor is a separate script the API serves.** `GET /api/agent-play/bridge` answers
`404` unless `isReviewerSession` — the same check and the same 404 the review desk gives,
so probing tells nobody whether they lack the route or the role. A reviewer gets
`{ source }` under `cache-control: private, no-store`, and the theater appends it to the
game document as a second inline `<script>`.

**So there is no flag to flip.** The session's `reviewer` hint only decides whether to
_attempt_ the fetch, sparing everyone else a certain 404; what decides the mode exists is
the response. A visitor who sets that hint by hand gets a 404 and a document with no agent
code in it, and every `agent:*` message they send lands in a frame with no listener for it.
Verified against a real game: a non-reviewer document answers zero agent messages, the
executor is absent from its HTML, and the ordinary player bridge keeps working.

**What the split costs.** The two scripts cannot share a closure, so the player bridge
publishes the handful of helpers the executor needs on `window.__GDPL_BRIDGE__` (post,
canvas lookup, the pause primitive, the capture, the legend readers). That handle is
reachable by game code too and deliberately grants it nothing new: a game can already
post to the parent, screenshot its own canvas, and stop its own loop.

**The honest limit.** This withholds _our_ agent interface. It cannot stop a determined
person from driving their own browser: `window.__GAME_HARNESS__` is GameKit's own surface
and has been in every published game since long before this mode existed. That is
acceptable here only because nothing scored or recorded comes out of this surface — the
gate and that decision hold each other up.

## Two ways to play, and when each is right

**A policy is how you play.** The reviewer writes a `playAgent(agent)` function, the page
injects it into the game document as an inline script, and it runs there — where a decision
costs microseconds instead of a message. It can branch, which is the whole difference: a
plan cannot say "if the game shows an east exit, take it", and playing anything real is
made of decisions like that.

It is also where debugging lives, because a run you cannot see into teaches nothing:

- `agent.log(...)` writes the transcript, and `console.log` inside the frame is captured
  into the same place — otherwise it is invisible to the host across an opaque origin.
- `agent.watch(name, value)` keeps a named series, so the answer shows a **trajectory**
  rather than a final snapshot. "Did input ever move anything" is a question only a series
  answers.
- `agent.capture(name)` paints and keeps a frame for the filmstrip.
- A policy that throws comes back as `failed` with its message and the frames it had spent.
- `agent.state()`, `observation()`, `ui()`, `api()`, `call(name, …args)`, and `game()` for GameKit.

Bounds, because the policy runs in the page: `agent.step()` counts against a frame budget
and throws past it, and a wall-clock cap stops a policy that steps forever. A policy that
loops without ever stepping can still hang its own frame, which is the reviewer's own tab.

**A plan is how you pin a sequence down.** The `CAPTURE.json` shape — `press`, `tap`,
`click`, `drag`, `wait`, `repeat`, `assert`, `waitFor`, `capture` — stays for fixed
reproductions, and it needs no injected script. It is the right tool for "this sequence
soft-locks the game" and the wrong tool for playing.

Measured against `cavern-of-words` in Chromium: a branching policy that read the game's own
`exits` field, clicked the matching widget and reported each move ran **138 frames in 63ms
inside the frame**. Stepping 600 frames costs 11ms without drawing and 547ms with; one
command from the host costs 9ms in round trip. A policy deciding every frame is therefore
about 500 times cheaper in-frame than from the host, which is why it runs there.

### Replies are correlated, because one command can answer twice

A screenshot answers with `agent:shot` and then a trailing `agent:state`. The plan runner
first consumed only the shot, so that trailing state was picked up as the _next_ command's
reply and every later trace entry, assertion and frame count ran one action behind. Each
command now carries an `id` and every reply echoes it.

### An action cannot overrun the plan's budget

The runner checked the budget between actions, so a single `wait 100` inside a ten-frame
plan ran all hundred and still reported `completed`. Each action is now clamped to what is
left, and a clamp is what `exhausted` means.

### The document waits for the bridge answer

The executor is part of the document. Mounting the frame first and swapping `srcDoc` when
the fetch lands would navigate the iframe twice and restart the game under whoever was
playing, so the load screen holds while the answer is in flight. Only a reviewer ever
waits, and only for a tiny same-origin request running beside a multi-megabyte one.

### One trap worth knowing

The bridge envelope owns the field name `source` — it is how the receiver tells our own
messages from a stranger's. The policy payload is `code` for that reason. A first cut named
it `source`, the envelope's tag was silently overwritten, and every policy message was
dropped as foreign.

## The unit is an attempt, not a keypress

One command per model turn cannot play a real-time game: the play window is 120 seconds,
catalog games run at 30fps, so one attempt is roughly 3600 frames. Nor is the page's text
generic enough to carry a review on its own — of the 123 games in the games repo, 118
report a `snapshot()` and all 123 have a how-to-play legend and pixels, but only 34 author
a `snapshot.observation` and only 4 register `ui` affordances. Both facts point the same
way, and the games repo's own review programme already went there: it replaced an
interactive loop with replayed `CAPTURE.json` plans.

**So the runner is the main surface.** A reviewer submits a plan in the games repo's
existing language — `press`, `tap`, `keyDown` / `keyUp`, `click`, `move`, `drag`, `wait`,
`repeat`, `assert`, `waitFor`, `capture` — and the page runs it over the bridge at full
speed with nothing waiting on a model. What comes back is an outcome (`completed`,
`failed`, `exhausted`, `aborted`), the frame budget it spent, every check it made with the
frame it made it at, a trace of state per action, and the captured frames as a filmstrip.

`seed` and `film` are accepted and ignored: no record comes from this surface, so a run
needs neither determinism nor a film window.

**The filmstrip is how a generic game is seen.** A plan that names `capture` moments gets
those; a plan that names none gets an evenly spaced strip plus a final frame. That is the
only channel that works on the 89 games which describe nothing in text, and it is what a
human reviewer looks at anyway.

**A plan that does not win is a result, not an error.** `waitFor never came true` and
`the plan ran out of its N frames` are outcomes a reviewer quotes, which is the whole
point of a review-only surface.

Measured against `cavern-of-words` in Chromium: a five-action plan with a `waitFor`, two
captures and an assert completed in 23 stepped frames and 212ms of wall clock, and moved
the game from its intro into a different room. Stepping cost scales with a game's draw
cost, so a heavy 3D game is slower per frame.

## How a game registers itself (ui / observation / helpers)

The panel does **not** eval into the sandboxed iframe, and Check 17 in the games repo
forbids game sources from writing `window.` or `__GAME_HARNESS__`. Mutating the harness at
runtime (via `globalThis` name-stitching) is therefore the wrong contract. Use the kit:

| Surface     | Official registration                                                                                                  | What the panel shows                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **State**   | `defineGame().snapshot(() => ({ cash, loan, … }))`                                                                     | the `state` line (primitives only)                             |
| **Seen**    | `snapshot.observation` as a JSON **string**, or `defineGame().observation(() => …)`                                    | the `seen` block; empty is visible, not hidden                 |
| **UI**      | `GameKit.ui.register(draw, label, enabled, { x, y, width, height })` during paint, or `defineGame().ui(() => widgets)` | `ui` hit-targets; `click x y` uses the midpoint                |
| **Helpers** | `defineGame().agentApi(() => ({ buildRail, camLookAt, … }))` or `harness.api`                                          | the `api` list; `call name [json]` / `agent.call(name, …args)` |

A tycoon toolbar is the same widget contract as an arcade button — register each tool's
canvas rectangle, do not invent a parallel `harness.ui` format unless the `ui` engine
module is not selected. Pixel bounds (`x, y, width, height`) and already-normalized
`x1,y1,x2,y2` are both accepted. The bridge also reads `harness.ui` / `harness.observation`
/ `harness.api` (and extra functions Object.assigned onto the harness) so an already-built
preview that assigned those fields starts working the moment this executor is served — no
game rebuild required.

`press` / `tap` / `click` remain the generic verbs. They are not enough for Deluxe-scale
construction: expose named helpers and call them from a policy. A policy that watches
`score` only will sit idle on an economic game whose snapshot uses `cash` / `delivered` /
`orders`; the starter policy watches those keys when present and does not require a
score.

Helpers run inside the game document. Arguments must be JSON (command box) or ordinary
values (policy). The host never `eval`s game code; `unknown command` on `buildRail` is the
parser refusing a verb that is not in the grammar — use `call buildRail …` instead.

## Not built yet

- **Telemetry.** No event is emitted in this mode. How an agent-driven play should be
  counted — and kept out of person-shaped metrics — is an open decision, not an oversight.
- **WebMCP registration.** The same command list could be registered as page tools for
  `document.modelContext`, exactly as the Studio code surface does. No agent consumes those
  today, so it is deliberately deferred.
- **Plan export.** A session could be exported in the games repo's `CAPTURE.json` shape so a
  browser agent's run can be verified by replay in CI.

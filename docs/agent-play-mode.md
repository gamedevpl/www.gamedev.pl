# Agent play mode — the design

> ⚠️ **Read "The shape is under revision" below before extending this.** The per-command
> interface shipped here is the right plumbing under the wrong primary interaction.
>
> Status: 🚧 **implementation spike (2026-09-13).** The bridge, the panel and the entry
> points are built and tested; the games-repo half (hidden fields in the document, sound
> as text) is not, and no telemetry is emitted yet. Strategy, options and the decisions
> this queues up live in the private ops repo (`agent-play-mode-research.md`).

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

A theater overlay that turns the running game into a turn-based text game with a picture
attached. Opened from the player's overflow menu, or default-on with `?agent=1` — the link
an agent is handed. Four rules carry the design:

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

| Piece                          | File                              | Role                                                                                             |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Grammar, formatting, redaction | `apps/web/src/agentPlay.ts`       | Pure and typed; parses a line into a command, formats state, hides declared fields               |
| In-frame executor              | `apps/web/src/agentPlayBridge.ts` | A source fragment concatenated into the player bridge; runs the verbs against `__GAME_HARNESS__` |
| Host state                     | `apps/web/src/useAgentPlay.ts`    | Sends commands, validates what comes back, folds in the game's play signals                      |
| The panel                      | `apps/web/src/AgentPlayPanel.tsx` | The rail an agent reads and types into                                                           |
| Entry points                   | `apps/web/src/GameTheater.tsx`    | Overflow-menu item, `?agent=1`, per-tab memory                                                   |

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

## Invariants this must not break

- **The sandbox stays exactly as it is.** `sandbox="allow-scripts allow-pointer-lock"`, no
  `allow-same-origin`, and `allow` never gains `tools`. Agent mode adds one message family
  to a bridge that was already hostile in both directions; it adds no capability to the
  game.
- **Game-authored text is data, never instructions.** State, observation and widget labels
  are written by an AI-generated game. The panel renders them as text, caps them, and says
  so in the guide it hands the agent.
- **Hidden answers stay hidden.** The CLI harness redacts `AGENT.json.hiddenFields` before a
  snapshot reaches an agent. That list does not travel with the assembled document yet, so
  the page reports `hiddenFields: null` and the panel says out loud that nothing is being
  withheld — a visible gap rather than a silent one.

## The shape is under revision

Reviewed the same day it was built, and two defects stand. Recorded here so nobody
extends the wrong half.

**It is not generic enough.** Counted across the 123 games in the games repo: 118 report a
`snapshot()`, all 123 carry a how-to-play legend and canvas pixels — but only 34 author a
`snapshot.observation`, and only 4 register `ui` affordances. So on a typical game the
panel's two richest blocks are empty. Closing that per game is the trap, not the fix. The
universally available channels are the snapshot, the legend and **the pixels**, and this
spike treats pixels as an afterthought rather than as the main way a generic game is seen.

**It puts the model in the frame loop.** One command per model turn cannot play a
real-time game: the play window is 120 seconds, catalog games run at 30 fps, so one
attempt is roughly 3600 frames. The games repo's own review programme already moved from
an interactive loop to replayed `CAPTURE.json` plans for exactly this reason.

**Where it goes.** The unit should be an _attempt_, not a keypress: the agent submits a
plan in the games repo's existing script language (`press`, `click`, `drag`, `repeat`,
`assert`, `waitFor`, `capture`), the page runs it at full speed over this bridge, and
answers with a trace plus the captured frames as a filmstrip. Everything in this document
below stays true — the bridge is exactly the `PlanDriver` such a runner needs — but the
command box becomes the exploration mode rather than the way anyone plays.

## Not built yet

- **The reviewer gate.** The mode is for reviewers, not players. The session already
  carries a `reviewer` hint (set from `REVIEWER_UIDS`, the same signal the review desk
  uses), and both the overflow entry and `?agent=1` must check it — `?agent=1` no-opping
  for everyone else rather than hiding a panel that still runs. The spike opens for
  anyone in the theater, so this is a must-fix, not a nicety. Note what the gate is and
  is not: the bridge, the stepping and the input all live in the visitor's own browser,
  so this is a product decision and not a security boundary, and it is only tolerable
  because nothing scored or recorded comes out of this surface.

- **The games-repo half.** Carrying `hiddenFields` into the assembled document, and
  emitting `sfx` / `music` events so sound becomes readable text. Until then a game with a
  hidden answer can leak it here, and an agent still cannot judge audio feedback.
- **Telemetry.** No event is emitted in this mode. How an agent-driven play should be
  counted — and kept out of person-shaped metrics — is an open decision, not an oversight.
- **WebMCP registration.** The same command list could be registered as page tools for
  `document.modelContext`, exactly as the Studio code surface does. No agent consumes those
  today, so it is deliberately deferred.
- **Plan export.** A session could be exported in the games repo's `CAPTURE.json` shape so a
  browser agent's run can be verified by replay in CI.

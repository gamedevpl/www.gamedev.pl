---
name: product-instrumentation
description: How to instrument features on www.gamedev.pl so product health stays measurable — the telemetry architecture, its privacy invariants, the event vocabulary, and the questions the data must always be able to answer. Use whenever you add or change a user-facing flow (play, creation, sign-in, sharing, party mode), touch telemetry code on either side, or add a metric or aggregate.
---

# Product Instrumentation

A feature that ships without measurement is a feature nobody can tell is working. This
skill defines what "instrumented well enough" means here, so every agent applies the same
bar without re-deriving it.

## The questions the data must always answer

Treat this as the measurement contract. Any change that makes one of these questions
harder to answer is a regression, even if no test fails. Any change that touches a flow
listed here ships with the events that keep the question answerable.

1. **First minute:** how long from landing to a first game actually being played, and
   where do people fall out in between?
2. **Session depth:** how many games does one visit play, and does a visit that arrives
   on a game page go on to play a second game?
3. **Acquisition:** did this visit arrive from a shared game link, a social post, search,
   or direct? (Referrer domain and UTM parameters — never more than that.)
4. **Creator funnel:** of the people who start typing a prompt, how many reach sign-in,
   submit, answer QA, get a published game, and play their own game?
5. **Creator return:** did a creator come back within 7 days of their game publishing —
   to play it, revise it, or make another?
6. **Per-game health:** does the game load, run, hold attention, and get finished?
   (Opens, focused play-time, alive frames, errors, progress, score, end.)
7. **Build economics:** how long did a build take from submission to publish, and how
   many revision cycles did it need?

## Architecture (both halves, always in sync)

Play telemetry has a fixed vocabulary defined in **three places that must change
together**, plus tests:

- [apps/web/src/telemetry.ts](../../../apps/web/src/telemetry.ts) — browser batching,
  caps, normalization. `TelemetrySession` is deliberately DOM-free so limits are testable.
- [apps/api/src/telemetry.ts](../../../apps/api/src/telemetry.ts) — zod schema, rate
  limits, published-slug gating, server-anchored timestamps.
- [apps/api/src/store/records/telemetry.ts](../../../apps/api/src/store/records/telemetry.ts)
  — `TelemetryEvent`. Daily-partition storage is
  [store/slices/telemetry.ts](../../../apps/api/src/store/slices/telemetry.ts).

Events from inside a game iframe arrive as `postMessage` with `source: 'gdpl-player'`
([apps/web/src/gamePlayer.ts](../../../apps/web/src/gamePlayer.ts)). The host accepts
`error`, `alive`, `progress`, `score`, `end` — validated, clamped, capped. The games repo
side of this contract is `.github/skills/report-play-signals/SKILL.md` in that repo; if
you change the vocabulary here, that skill must change in the same sitting.

Visit telemetry is the second, separate stream — the funnel before and between games:

- [apps/web/src/visitTelemetry.ts](../../../apps/web/src/visitTelemetry.ts) — per-tab
  identity, acquisition capture, navigation subscription.
- [apps/api/src/visit-telemetry.ts](../../../apps/api/src/visit-telemetry.ts) —
  `POST /api/telemetry/visit`, schema and caps.
- [apps/api/src/visit-funnel.ts](../../../apps/api/src/visit-funnel.ts) — the read-side
  aggregator (`summarizeVisitFunnel`).
- `VisitEvent` / `VISIT_COLLECTION` in
  [store/records/telemetry.ts](../../../apps/api/src/store/records/telemetry.ts) — the
  event's field types are plain `string` here, not the closed enums below.

The step/via/kind vocabularies each of those three files share (route kinds, funnel
steps, `PlayVia`, and so on) live in one canonical module,
[packages/contract/src/visit-vocab.ts](../../../packages/contract/src/visit-vocab.ts) —
an `X_VALUES` array plus an `X` type per vocabulary. All three files import from it
instead of declaring their own copy. **Adding a rung means adding it to the shared array
in `visit-vocab.ts`; the browser client, the zod schema, and the funnel aggregator pick
it up from that one import.** `BuilderDimension` (`'platform' | 'self'`) is the one
exception still declared separately in each of the three files — it also touches two
frozen mega-files (`mcp-server.ts`, `submissions.ts`) and has not been folded in yet.

**The two streams must stay unjoinable.** A play event names a game and never a visit; a
visit event names a visit and never a game. That is why `play_started` carries no slug —
it answers "did this sitting play a second game" without making "which games did this tab
play, in order" derivable. Adding a slug (or any shared key) to the visit stream breaks
the privacy posture of both, so treat it as a design change, not a field addition.

Route kinds are read through the app's own router (`parsePathRoute`), never re-derived
from the URL. Routing has already changed shape once — hash fragments to real paths — and
a private copy of the URL grammar survives that change by silently reporting `home` for
every visit, including the shared game links this stream exists to count.

Creator-side facts (submissions, build events, revision messages, publish times) live in
Firestore via the store — they are identity-attached and that is fine; creators are
signed in. Both telemetry streams are the anonymous half.

## Invariants (do not renegotiate these per-feature)

- **Play telemetry measures games, not people.** No uid, no IP, no user agent, no
  persistent identifier in play events. A per-game-open session id is a uuid held in
  memory only. If a metric seems to require identifying a player, redesign the metric.
- **Visit-scoped correlation, when needed, is ephemeral:** `sessionStorage` at most,
  never a cookie, never localStorage, gone when the tab closes.
- **Acquisition data is coarse:** referrer _domain_ (not full URL) and UTM values. Never
  place personal data in URLs or events.
- **Everything from a game iframe is hostile input.** Fixed vocabulary, length clamps,
  numeric clamps, per-request / per-session / per-IP caps. Copy the existing patterns;
  do not invent looser ones.
- **Aggregates only leave the building.** Admin and any future dashboard return
  aggregates, never raw event rows.
- **Telemetry never breaks the product.** Best-effort sends, swallowed failures, and a
  flush path that survives tab death (`keepalive`, flush-on-hidden).
- **Derive, don't declare.** Prefer metrics computed from observed behavior over
  self-reported flags (the same principle as deriving touch support from game source).
- **Stable names.** Event types and progress labels are an API: renaming one breaks
  every time series that contains it. Extend deliberately; never repurpose. This binds
  _fields_ as much as event names, and `VisitEvent` is one flat bag shared by every
  event type — so its field names are already spoken for across the whole stream.
  `entry` is the route a visit landed on; `via` is which surface opened a thing;
  `step`, `route`, `builder`, `detail`, `reopen` likewise. A new dimension gets a new
  name (`control` for which remix button was pressed), never a second meaning on an
  existing one — a field that means two things makes every row written before the
  second meaning ambiguous, and no migration can tell them apart afterwards.
- **Bots are not people, and the data must know it.** Automation accounts live in the
  `bot:` uid namespace ([`docs/agent-access-tokens.md`](../../docs/agent-access-tokens.md)).
  A token-authenticated request records no `activeDays` entry, and `bot:` submissions are
  excluded from `summarizeCreatorMetrics` — otherwise an agent on a schedule reports
  flawless retention for a creator who does not exist, and the one number Stage 0 gates on
  becomes a measurement of our own test suite. Any new person-shaped metric (retention,
  return, cohort, funnel-by-account) must exclude the prefix the same way; play and visit
  telemetry need no change, since neither is attributed at all. **Play affinity** (the
  signed-in open history behind home-page recommendations) is person-shaped and follows
  the same rule: `bot:` uids neither write affinity nor receive personalised picks. Affinity
  is **not** play telemetry — it lives under `users/{uid}/playAffinity` and is erased with
  the account; never join it to `playEvents` or visit events.

## Known gaps (prefer closing one over inventing new metrics)

Current state, audited 2026-07-25 and updated as gaps close. When your task touches an
adjacent flow, close the gap in the same change or flag it explicitly in the PR:

- ~~No landing/visit events~~ — **closed**: `visit_started` / `route_viewed` /
  `play_started` now cover questions 1–3.
- ~~Session depth unmeasurable~~ — **closed**: visit-scoped ephemeral id in
  `sessionStorage`; count `play_started` per `visitId`.
- ~~No referrer/UTM capture~~ — **closed**: coarse referrer hostname plus filtered
  `utm_source` / `utm_medium` / `utm_campaign` on `visit_started`.
- **Follow-ups the visit stream left open:**
  - ~~`visitEvents` needs its own Firestore TTL policy~~ — **closed 2026-07-26**: the
    policy is live, and [infra/setup-gcp.sh](../../../infra/setup-gcp.sh) step 6/6 now
    loops over every telemetry collection group instead of naming `playEvents` alone.
    **A new stream must add its group to that loop in the same change** — a group with
    no policy still writes `expiresAt`, nothing errors, and nothing expires.
  - ~~`startVisitTracking` patches `history.pushState`~~ — **closed**: `App` emits a
    `gdpl:navigate` event (`5fe02928`) and the listener uses it (`79dd4026`).
- ~~Nothing reads the visit stream~~ — **closed 2026-07-26**: `summarizeVisitFunnel`
  ([visit-funnel.ts](../../../apps/api/src/visit-funnel.ts)) behind
  `GET /api/admin/telemetry/visits`, rendered by `VisitFunnelPanel` beside game health
  on the operator page. Both admin reads share one partition-scan budget, so the two
  views cannot drift in how they report truncation.
  - ~~Creator funnel starts too late~~ — **closed 2026-07-26**: `create_step` on the visit
    stream records `prompt_started` → `spec_submitted` → `signin_required` → `qa_shown` →
    `title_confirmed` → `submission_created` → `handoff_shown` → `handoff_enter_studio`
    (the last two measure the platform welcome handoff before Studio). Steps dedupe per
    visit (a rung means "this visit got this far"),
    and the aggregate dedupes again so a replayed flush cannot inflate one. Adding a rung
    means adding it to `CREATE_STEPS` in `packages/contract/src/visit-vocab.ts` — the
    order _is_ the funnel's meaning, and all three files (`visitTelemetry.ts`,
    `visit-telemetry.ts`, `visit-funnel.ts`) import it from there. The waitlist funnel
    (`waitlist_step` / `WAITLIST_STEPS`) follows the same shared-module contract beside it.
  - ~~Closed-beta waitlist funnel unmeasured~~ — **closed 2026-07-31**: `waitlist_step` on
    the visit stream records `cta_clicked` → `joined`. Same shared-module contract as
    `create_step` — `WAITLIST_STEPS` in `packages/contract/src/visit-vocab.ts`; rendered
    as a Waitlist block on `VisitFunnelPanel` beside Creating.
    The Join CTA is visible before sign-in; the drop between click and join _is_ the
    sign-in wall, so there is no separate `signin_required` rung (that name already means
    the creation wall).
  - ~~BYOCA / self-build funnel unmeasured~~ — **closed 2026-08-01 (BY-08)**: `studio_step`
    on the visit stream records `builder_chosen` → `connect_copied` (also `connect_deeplink`,
    `connect_dismissed`, `connect_restored`) → `agent_signaled` →
    `gate_verdict`, each with a required `builder` dimension (`platform` | `self`). Optional
    `detail` is a closed enum (`install` | `kickoff` | `header` | `cursor` | `vscode` |
    `green` | `red` | `kit_outdated` | `creator` | `agent`). BY-18c adds sibling step
    `connect_deeplink` (`detail: cursor | vscode`) so one-click install clicks are not
    conflated with clipboard copies. `create_step` may also carry optional `builder` once
    chosen. `StudioStep` / `StudioStepDetail` live in
    `packages/contract/src/visit-vocab.ts` like the other step vocabularies;
    `builder` itself is still `BuilderDimension`, declared separately in each of
    `visitTelemetry.ts`, `visit-telemetry.ts`, and `VisitEvent` in
    `store/records/telemetry.ts` (not yet folded into the shared module — see
    Architecture above). Time-to-first agent signal is `msSinceStart` on
    `agent_signaled`. ~~No admin rollup yet~~ — **closed 2026-08-06**: daily MCP adoption
    series (`selfChosen` / `connected` / `signaled` / `gateVerdicts`) on
    `GET /api/admin/telemetry/trends`, rendered on the Trends strip of the operator
    telemetry tab beside visits/plays/creations.
  - ~~Code surface funnel written but unread~~ — **closed 2026-08-11**: `code_step`
    (`offered` → `opened` → `file_opened` → `edited` → `typechecked` → `previewed` →
    `delivered` → `published`, plus `read_only_agent`/`conflict_seen` outcomes beside the
    ladder) was landing on the visit stream since CE-01 with no read side —
    `summarizeVisitFunnel` had no rollup and the admin route couldn't expose it. Added
    `coding` to `VisitFunnel` (`visit-funnel.ts`), rendered as a Code surface block on
    `VisitFunnelPanel` beside Editing. `CODE_STEPS` lives in the shared vocabulary module
    like the others.
  - ~~Managed delivery preflight / gate effectiveness unmeasured~~ — **closed (MR-07)**:
    server log metrics in `delivery-metrics.ts` (`delivery preflight refused`,
    `delivery accepted`, `delivery gate verdict`) answer whether audio/symbols/typecheck
    preflights catch bad submits, how many attempts a caught round needs, and whether
    async gate failure rates fall. No visit-stream join; no source/prompt/uid in payloads.
- ~~How-to-play opens recorded but unreadable~~ — **closed 2026-07-31** for the read
  path that [#395](https://github.com/gamedevpl/www.gamedev.pl/issues/395) needs:
  `how_to_play_opened` carries `via: 'bar' | 'more'` and optional `reopen: true` (same
  theater card opened again — not "opened twice in the visit"), is recorded only for
  published plays (`reportSlug`, same population as `play_started`), and
  `summarizeVisitFunnel` exposes `howToPlay` (opens/visits among playing visits, same-
  card repeat visits, via, byEntry with `playingVisits` denominators). Rendered on
  `VisitFunnelPanel`. The product decision in #395 is to ship the richer How to play
  tone (Goal required; Scoring / Mode optional) via game `.legend-keys` — see
  [`docs/how-to-play-plan.md`](../../../docs/how-to-play-plan.md). Funnel numbers still
  inform discoverability; they no longer gate whether to ship the format.
- ~~Creator return is under-measured~~ — **closed 2026-07-26**: `User.activeDays` (a
  capped list of `yyyy-mm-dd`, touched once per account per day from the auth hook)
  plus `summarizeCreatorMetrics` behind `GET /api/admin/telemetry/creators`. Use a list
  rather than a `lastSeenAt` instant if you extend this — a single timestamp cannot tell
  "returned on day 2 and day 30" from "returned only on day 30", which is the whole
  question. Build duration median/p90 ships alongside it, covering question 7.
- ~~Games emit no depth events~~ — **closed 2026-07-26**, both halves. GameKit's shared
  `report` funnel emits `end` on the transition into a terminal snapshot state (and the
  round's `score` with it), so all 83 games gained it in one change; `summarizeGameHealth`
  turns those into `finishRate`, `winRate`, `medianBestScore` and a `progressLabels`
  funnel, rendered as four columns on the operator page. Two rules that came out of it:
  - **A game that emits nothing and a game nobody finishes produce identical rows.** The
    view renders `—`, never `0%`, when a game reported no endings at all — and no verdict
    badge reads off finish rate, because "nobody finishes this" is not yet supportable.
    Any future depth metric inherits this: absence of evidence renders as absence.
  - Depth events take **no continuity check**, unlike `alive`. That check exists because a
    frame counter is meaningless without the interval it covers; an ending is a discrete
    thing a player did, and a slept machine does not fabricate one.
- **`progress` landmarks are emitted by 13 of ~82 games so far** (2026-07-26) — the
  vocabulary, the cap, and the read-side funnel all exist and are tested, but labels are
  per-game and GameKit cannot guess them. Unlike the other depth signals this one cannot
  be closed by a platform-wide change: coverage grows only as maintenance touches a game
  and adds its landmarks (see the games repo's `report-play-signals` skill), so most of
  the catalog stays dark on this signal indefinitely — that is expected, not a bug to fix
  in one pass.
- ~~Nothing aggregates per-game signals durably~~ — **closed 2026-07-27**: a nightly
  Cloud Scheduler sweep (`POST /api/internal/scorecard-sweep`,
  [scorecard.ts](../../../apps/api/src/scorecard.ts)) writes
  `games/{slug}/scorecard/current` from a 28-day telemetry window plus vote and feedback
  counts. **This doc is the only thing IL-3's agents are permitted to read**, which makes
  two of its properties load-bearing for anything added to it later:
  - **Game-supplied strings live under `untrusted`, never beside the numbers.**
    `errorSamples[].message` and `progressLabels[].label` are chosen by a game inside the
    sandbox. Quarantining them structurally (rather than by comment) means a prompt built
    by destructuring the scorecard cannot pick one up by accident, and a test asserts no
    such string is reachable elsewhere in the doc. **Any new attacker-controlled field
    belongs in `untrusted` too** — that is the rule, not a one-off.
  - **`null` is "no evidence"; `0` is "measured zero".** The operator page renders `—` for
    the same distinction; the scorecard encodes it in the data, because an agent acts on
    the value rather than reading a dash next to it. `finishRate` is null when a game
    emitted no endings at all.
  - Scorecards carry a feedback **count** and no text. Text arrives with the theme
    extraction that summarizes it, not before — the moment raw text lands here it is on
    the path to an agent.
  - No TTL, deliberately: retention is a promise about raw play rows, and an aggregate is
    what is meant to outlive them. Do **not** add this group to the TTL loop.
    Partial progress from Creator Studio: the `/studio` route is a distinct visit kind
    (`studio`), so "did they open the control panel after publish" is measurable from the
    visit stream without joining to play events.
- **Build economics are duration-only** — submission→publish timestamps and build events
  exist; revision-cycle counts are derivable; keep it that way as builds evolve.
- ~~Shared zones were unmeasured~~ — **closed 2026-07-31**: `zone_link`
  (`admitted` → `joined` → `lost`) on the play stream, aggregated as `zoneJoinRate` and
  rendered as the Shared column beside Finished. It exists because the shell falls back
  to solo play _in silence_ when it cannot reach the host — correct for the player, and
  the reason a dead zone host and a healthy one are indistinguishable from outside. Three
  rules came out of it, and they generalise to any signal the shell reports _about_ a
  game rather than _from_ one:
  - **The rung is the evidence, not the attempt.** `joined` fires on the arrival of a
    snapshot, never on the socket opening. A connection that upgrades and is then closed
    is exactly how the host failed on its first day; pinning the rung to the socket would
    have had the metric reporting health throughout the outage.
  - **A shell-owned signal needs its own channel _and_ its own budget.** `gamePlayer.ts`
    does not accept these types over postMessage, so a game cannot claim to be shared
    while sitting alone — but until they also had a session cap of their own, a frame
    could flood past the shared 400-event ceiling and force its own zone to render `—`.
    Separating the channel stops a game lying; separating the budget stops it silencing.
  - **A ratio must not be able to exceed its own maximum.** Both rungs travel in
    best-effort batches, so a session can land `joined` while the request carrying
    `admitted` was lost. Count the numerator only inside the denominator's set; a session
    missing its `admitted` is one more "no evidence", and the residual bias then
    understates success rather than inventing it.
- **A game with no rounds cannot report a score** — `score` is emitted only from the
  transition into a terminal snapshot state (games-repo `shared/modules/core.ts`), so
  ember-watch reports none since it became a continuous world (games-repo #163), and
  `finishRate` / `winRate` / `medianBestScore` read `—` for it permanently. Half of that
  is right: a world with no endings has no finish rate. The other half is a real loss —
  saves are a meaningful score there, they just have no round boundary to be reported at.
  Closing it means deciding what `score` means for a game that never ends, which is a
  platform question rather than one game's, so it is named here rather than special-cased.

## Definition of done for instrumentation

Before finishing a change to a user-facing flow, answer in the PR description: _which of
the seven questions does this flow affect, and what query over which data now answers
it?_ If the honest answer is "none" or "still can't", say that explicitly — a named gap
is acceptable; a silent one is not.

Self-improvement clause: if this skill is wrong, stale, or missing something that cost
you time, update it in the same session.

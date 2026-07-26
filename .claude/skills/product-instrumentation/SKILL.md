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
- [apps/api/src/store.ts](../../../apps/api/src/store.ts) — `TelemetryEvent`, daily
  partitions.

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
- `VisitEvent` / `VISIT_COLLECTION` in [store.ts](../../../apps/api/src/store.ts).

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
  every time series that contains it. Extend deliberately; never repurpose.

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
- **Creator funnel starts too late** — nothing is recorded before the submission
  document exists; the prompt → sign-in → submit steps are dark. The visit stream is the
  natural home for the pre-submission steps (it is already anonymous and visit-scoped).
- **Creator return is under-measured** — `lastLoginAt` only updates on sign-in, and
  sessions are long-lived; an authenticated `lastSeenAt` touch (daily granularity is
  enough) is missing.
- **Games emit no depth events** — the host listens for `progress`/`score`/`end` but no
  GameKit module sends them, so per-game drop-off and completion are dark. The fix
  belongs in the games repo's shared GameKit (once, platform-wide), not per game.
- **Build economics are duration-only** — submission→publish timestamps and build events
  exist; revision-cycle counts are derivable; keep it that way as builds evolve.

## Definition of done for instrumentation

Before finishing a change to a user-facing flow, answer in the PR description: _which of
the seven questions does this flow affect, and what query over which data now answers
it?_ If the honest answer is "none" or "still can't", say that explicitly — a named gap
is acceptable; a silent one is not.

Self-improvement clause: if this skill is wrong, stale, or missing something that cost
you time, update it in the same session.

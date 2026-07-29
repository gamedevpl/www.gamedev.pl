# Game recommendations (home-page “For you” rail)

> Status: ✅ Built (2026-07-29). A separate recommendations rail on the home page,
> fed by community scorecards and signed-in play affinity. Does **not** reorder the
> main arcade catalog.

## Why a rail, not a reorder

[`improvement-loop-plan.md`](./improvement-loop-plan.md) deliberately keeps measured
outcomes off catalog ranking in v1 — coupling discovery to telemetry invites gaming
before anti-gaming exists. Recommendations therefore ship as a second section above
`#arcade`, leaving games-repo order intact.

## Signals

| Source | What | Identity |
| ------ | ---- | -------- |
| Scorecards | Sessions, vote net, finish rate, median play time (28-day roll) | None — aggregates about games |
| Play affinity | `users/{uid}/playAffinity/{slug}` — open count + last opened | Signed-in humans only |
| Recent plays (browser) | `localStorage` list, forwarded as `?recent=` hints | Device-local; never stored as identity from this path |

Anonymous play telemetry (`playEvents`) and visit telemetry stay **unjoinable** and
**unattributed**. Affinity is an account feature like votes and saves, disclosed in the
privacy notice, and erased with the account (`erase-player-signals.ts`).

Automation accounts (`bot:` uids) do not write affinity and do not personalise.

## API

- `POST /api/games/:slug/played` — session optional; writes affinity for signed-in
  non-bot users; `204` otherwise. Best-effort from the player shell when a published
  document loads.
- `GET /api/recommendations?recent=slug1,slug2&limit=8` — public read; personalises
  when a session is present. Returns `{ items: [{ slug, reason }] }` with reasons
  `continue` | `for_you` | `because_you_played` | `popular`.

Scoring lives in [`apps/api/src/recommend.ts`](../apps/api/src/recommend.ts): community
score from the scorecard, plus genre boosts from affinity / recent hints. Up to two
recent affinity games surface as “continue”.

## UI

[`RecommendedCatalog`](../apps/web/src/RecommendedCatalog.tsx) above
[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx). Hidden when the API returns
nothing useful (no scorecards and no personal signal) so a cold environment does not
show an empty promise.

# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid is **sorted** by a
> ranking that mixes community scorecards with signed-in play affinity. There is
> no separate recommendations section — one Games list, reordered.

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

When there is no scorecard evidence and no personal signal, the grid keeps
games-repo order rather than inventing a shuffle.

## API

- `POST /api/games/:slug/played` — session optional; writes affinity for signed-in
  non-bot users; `204` otherwise. Best-effort from the player shell when a published
  document loads.
- `GET /api/recommendations?recent=slug1,slug2&limit=` — public read; personalises
  when a session is present. Defaults to ranking the **whole** published catalog.
  Returns `{ items: [{ slug, reason }] }` with reasons
  `continue` | `for_you` | `because_you_played` | `popular`.

Scoring lives in [`apps/api/src/recommend.ts`](../apps/api/src/recommend.ts): community
score from the scorecard, plus genre boosts from affinity / recent hints. Up to two
recent affinity games float to the top as “continue”; everything else follows by score.

## UI

[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx) fetches the ranking and reorders
its grid. Games missing from a partial response stay at the end in their original
relative order so nothing disappears. A quiet subtitle appears under “Games” only
when a ranking actually applied.

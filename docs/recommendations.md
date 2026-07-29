# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid can be sorted several
> ways. **Recommended** is the default; players can also pick Newest, Most played,
> Last played, or A–Z. **Not played** is a filter. A signed-in creator’s published
> games are pinned to the front of the same gallery (additive — not a filter).

## Sort modes

| Mode | Signal |
| ---- | ------ |
| Recommended | Scorecards + signed-in play affinity / anonymous recent hints ([`recommend.ts`](../apps/api/src/recommend.ts)) |
| Newest | Submission `publishedAt` when known; otherwise reverse catalog order |
| Most played | Scorecard session counts |
| Last played | Signed-in play affinity timestamps, else device-local recent plays |
| A–Z | Title, case-insensitive |

## Your games (pinned, additive)

When signed in, published slugs from `/api/submissions/mine` are sorted with the
current mode **among themselves**, then placed first in the grid; everyone else’s
games follow under the same sort. Cards owned by the visitor get a **Yours** badge.
This unifies “your games + the rest” in one gallery rather than a separate filter.

## Filters

| Filter | Effect |
| ------ | ------ |
| Not played | Show only games with no play affinity and no device-local recent open |

Sort preference is remembered in `localStorage` (`gdpl.catalogSort`); the Not played
filter in `gdpl.catalogFilters`. The last recommendations payload is cached in
`sessionStorage` (`gdpl.catalogSortSignals`) so a reload does not flash
catalog-default order before the network returns.

Controls sit on one row beside the Games heading: Not played toggle + Sort ▾
(menu closes on outside tap / Escape).

## Signals & privacy

| Source | What | Identity |
| ------ | ---- | -------- |
| Scorecards | Sessions, vote net, finish rate, median play time (28-day roll) | None — aggregates about games |
| Play affinity | `users/{uid}/playAffinity/{slug}` — open count + last opened | Signed-in humans only |
| Recent plays (browser) | `localStorage` list, forwarded as `?recent=` hints | Device-local |
| My submissions | Published slugs pinned first in the gallery | Signed-in creator |

Anonymous play telemetry (`playEvents`) and visit telemetry stay **unjoinable** and
**unattributed**. Affinity is an account feature like votes and saves, disclosed in the
privacy notice, and erased with the account (`erase-player-signals.ts`).

Automation accounts (`bot:` uids) do not write affinity and do not personalise.

When Recommended has no scorecard evidence and no personal signal, that mode keeps
games-repo order rather than inventing a shuffle.

## API

- `POST /api/games/:slug/played` — session optional; writes affinity for signed-in
  non-bot users; `204` otherwise.
- `GET /api/recommendations?recent=slug1,slug2` — returns ranking plus sort helpers:

```json
{
  "items": [{ "slug": "…", "reason": "popular" }],
  "popularity": [{ "slug": "…", "sessions": 12 }],
  "lastPlayed": [{ "slug": "…", "lastPlayedAt": "…" }],
  "newest": ["slug-a", "slug-b"]
}
```

## UI

[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx) shows the Not played toggle and
Sort dropdown beside the Games heading, pins the creator’s published games first,
then filters/reorders the same grid. Logic lives in
[`catalogSort.ts`](../apps/web/src/catalogSort.ts).

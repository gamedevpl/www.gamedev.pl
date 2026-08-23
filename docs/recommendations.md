# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid can be sorted several
> ways. **Recommended** is the default; players can also pick Newest, Most played,
> Last played, or A–Z. **My games** and **Not played** are filters. A signed-in
> creator’s published games are pinned to the front of the same gallery when the
> My games filter is off.

## Sort modes

| Mode        | Signal                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Recommended | Scorecards + signed-in play affinity / anonymous recent hints ([`recommend.ts`](../apps/api/src/catalog/recommend.ts)) |
| Newest      | Submission `publishedAt` when known; otherwise reverse catalog order                                                   |
| Most played | Scorecard session counts                                                                                               |
| Last played | Signed-in play affinity timestamps, else device-local recent plays                                                     |
| A–Z         | Title, case-insensitive                                                                                                |

## Your games (merged into Games)

When signed in, the home **Games** gallery is one list:

1. **In-progress builds** (queued / building / …) as cards that open the status page
2. **Your published games** (pinned first among catalog entries, with a Yours badge)
3. **Everyone else’s games** under the current sort

There is no separate “Your games” section. Studio remains one click from the Games
heading when you have builds or published games. Published slugs come from
`/api/submissions/mine`; locally saved specs cover anonymous-era gaps.

## Filters

| Filter     | Effect                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| My games   | Show only the signed-in creator’s published games (plus in-progress builds). Hidden when signed out or when you have no builds/published games. |
| Not played | Show only games with no play affinity and no device-local recent open                                                                           |

Filters combine with AND. Sort preference is remembered in `localStorage`
(`gdpl.catalogSort`); filters in `gdpl.catalogFilters`. The last recommendations
payload is cached in `sessionStorage` (`gdpl.catalogSortSignals`) so a reload does
not flash catalog-default order before the network returns.

Controls sit on one row beside the Games heading: My games (when you have
games) + Not played + Sort ▾ (menu closes on outside tap / Escape).

## Signals & privacy

| Source                 | What                                                            | Identity                      |
| ---------------------- | --------------------------------------------------------------- | ----------------------------- |
| Scorecards             | Sessions, vote net, finish rate, median play time (28-day roll) | None — aggregates about games |
| Play affinity          | `users/{uid}/playAffinity/{slug}` — open count + last opened    | Signed-in humans only         |
| Recent plays (browser) | `localStorage` list, forwarded as `?recent=` hints              | Device-local                  |
| My submissions         | Published slugs pinned first in the gallery                     | Signed-in creator             |

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

Community half (`scorecards` → popularity / recommended base, plus newest from
recent publishes) is cached in-process for ~5 minutes and coalesced while refreshing —
those Firestore reads otherwise run on every home-page load. Personal affinity and
`?recent=` hints are applied per request on top of that shared snapshot.

The browser also caches the last payload in `sessionStorage`, keyed to the signed-in
viewer (cleared on logout), so a reload can paint immediately without flashing the
wrong account's affinity.

## UI

[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx) shows the My games / Not played
toggles and Sort dropdown beside the Games heading, pins the creator’s published
games first when My games is off, then filters/reorders the same grid. Logic lives
in [`catalogSort.ts`](../apps/web/src/catalogSort.ts).

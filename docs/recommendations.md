# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid can be sorted several
> ways. **Recommended** is the default; players can also pick Newest, Most played,
> Last played, or A–Z. Filters (**Your games**, **Not played**) are separate from
> sort and can be combined.

## Sort modes

| Mode | Signal |
| ---- | ------ |
| Recommended | Scorecards + signed-in play affinity / anonymous recent hints ([`recommend.ts`](../apps/api/src/recommend.ts)) |
| Newest | Submission `publishedAt` when known; otherwise reverse catalog order |
| Most played | Scorecard session counts |
| Last played | Signed-in play affinity timestamps, else device-local recent plays |
| A–Z | Title, case-insensitive |

## Filters

| Filter | Effect |
| ------ | ------ |
| Your games | Show only published slugs owned by the signed-in creator (`/api/submissions/mine`) |
| Not played | Show only games with no play affinity and no device-local recent open |

Filters AND together. Sort preference is remembered in `localStorage`
(`gdpl.catalogSort`); active filters in `gdpl.catalogFilters`. The last
recommendations payload is cached in `sessionStorage` (`gdpl.catalogSortSignals`)
so a reload does not flash catalog-default order before the network returns.

Controls sit on one row beside the Games heading: Filter ▾ + Sort ▾ (menus close
on outside tap / Escape). Your games appears only when signed in.

## Signals & privacy

| Source | What | Identity |
| ------ | ---- | -------- |
| Scorecards | Sessions, vote net, finish rate, median play time (28-day roll) | None — aggregates about games |
| Play affinity | `users/{uid}/playAffinity/{slug}` — open count + last opened | Signed-in humans only |
| Recent plays (browser) | `localStorage` list, forwarded as `?recent=` hints | Device-local |
| My submissions | Published slugs for the Your games filter | Signed-in creator |

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

[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx) shows Filter and Sort dropdowns
beside the Games heading, then filters/reorders the same grid. Logic lives in
[`catalogSort.ts`](../apps/web/src/catalogSort.ts).

# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid can be sorted several
> ways. **Recommended** is the default; players can also pick Newest, Most played,
> Last played, or A–Z.

## Sort modes

| Mode | Signal |
| ---- | ------ |
| Recommended | Scorecards + signed-in play affinity / anonymous recent hints ([`recommend.ts`](../apps/api/src/recommend.ts)) |
| Newest | Submission `publishedAt` when known; otherwise reverse catalog order |
| Most played | Scorecard session counts |
| Last played | Signed-in play affinity timestamps, else device-local recent plays |
| A–Z | Title, case-insensitive |

Preference is remembered in `localStorage` (`gdpl.catalogSort`).

## Signals & privacy

| Source | What | Identity |
| ------ | ---- | -------- |
| Scorecards | Sessions, vote net, finish rate, median play time (28-day roll) | None — aggregates about games |
| Play affinity | `users/{uid}/playAffinity/{slug}` — open count + last opened | Signed-in humans only |
| Recent plays (browser) | `localStorage` list, forwarded as `?recent=` hints | Device-local |

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

[`ArcadeCatalog`](../apps/web/src/ArcadeCatalog.tsx) shows a sort control next to the
Games heading and reorders the same grid. Sort logic lives in
[`catalogSort.ts`](../apps/web/src/catalogSort.ts).

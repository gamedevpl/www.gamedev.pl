# Game recommendations (catalog sort order)

> Status: ✅ Built (2026-07-29). The home-page arcade grid can be sorted several
> ways. **Recommended** is the default; players can also pick Newest, Most played,
> Last played, or A–Z. **Not played** is a separate filter (hide games already
> opened), not a sort mode.

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
| Not played | Show only games with no play affinity and no device-local recent open |

Sort preference is remembered in `localStorage` (`gdpl.catalogSort`); the Not played
filter in `gdpl.catalogNotPlayed`. Controls sit on one row beside the Games heading:
filter toggle + sort dropdown (menu closes on outside tap / Escape).

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
  humans; always 204 for bots / anonymous
- `GET /api/recommendations?recent=slug,slug` — returns `{ items, popularity, lastPlayed, newest }`
  for the catalog toolbar (`apps/web/src/recommendationsApi.ts`)

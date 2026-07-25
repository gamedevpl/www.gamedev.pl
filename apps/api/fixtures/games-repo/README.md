# Fixture games repo

A minimal directory shaped exactly like the games repository, so `npm run dev` can serve a
working arcade with no GitHub token and no access to the private games repo.

**These are fixtures, not the catalog.** They exist so a contributor can exercise the whole
product — browse, play, party lobby, creation flow — within minutes of cloning. Two small
games is enough for that and keeps the repo light.

They are deliberately self-contained: each `game.ts` is plain TypeScript against the canvas
API and imports nothing from `shared/modules`. The real games use the GameKit engine that
lives in the games repo; a stub of it here would be a second implementation free to drift
from the real one without anything failing, which is the trap `GAME_KIT_MODULES` in
`apps/api/src/github-client.ts` already warns about. `shared/modules/core.ts` therefore does
the minimum the bundler requires and claims nothing more.

If you have a checkout of the games repo next to this one, it is used instead of these
fixtures automatically and you get the real catalog. See `docs/local-development.md`.

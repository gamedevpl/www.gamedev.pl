# Fixture games repo

A minimal directory shaped exactly like the games repository, so `npm run dev` can serve a
working arcade with no GitHub token and no access to the private games repo.

**These are fixtures, not the catalog.** They exist so a contributor can exercise the whole
product — browse, play, party lobby, creation flow — within minutes of cloning.

| Slug                         | Role                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pixel-dodge`, `odd-one-out` | Self-contained canvas games (no GameKit). Fast path for local play/party.                                                                                                                                                                                                |
| `range-squad`                | **Contract-regression fixture** — modular `game/` graph, `gfx`/`actors`/`audio`, and `audio.music` as a string. Catches the serve-time drift that 502'd the live catalog (issue #247). Shared module files under `shared/modules/` are flag stubs, not a second GameKit. |

If you have a checkout of the games repo next to this one, it is used instead of these
fixtures automatically and you get the real catalog. See `docs/local-development.md`.

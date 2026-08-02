# Richer how-to-play — plan

> Decision: prefer a richer card tone (goal, optional scoring / per-mode) over a flat
> key→action list alone. Tracked as [#395](https://github.com/gamedevpl/www.gamedev.pl/issues/395);
> Visit funnel numbers from [#402](https://github.com/gamedevpl/www.gamedev.pl/pull/402) still
> inform discoverability and whether the card is answering people, but they no longer
> gate _whether_ to ship the richer format.

## Shape (games own the prose)

Richer content lives in the game's `.legend-keys` markup — already scraped by the player
bridge, already localized, **zero GameKit bytes**. Do not put goal/scoring into
`controlsManifest()` (input facts only; kit budget is tight).

Reserved `dt` labels (English canonical + Polish twin):

| Role    | `data-i18n-en` | `data-i18n-pl` | Required?                              |
| ------- | -------------- | -------------- | -------------------------------------- |
| Goal    | `Goal`         | `Cel`          | **Yes** once a game has `.legend-keys` |
| Scoring | `Scoring`      | `Punkty`       | Optional                               |
| Mode    | `Mode: …`      | `Tryb: …`      | Optional, repeatable                   |

Key rows stay as today (`← →` → Move — only keys the game actually binds). SPEC `controls:`
remains the short English catalog / LLM string — keep it in sync with the legend, do not
replace it with nested YAML (frontmatter is flat).

## Host

The theater card already renders every legend `dt`/`dd` as a `ControlRow`. Reserved labels
get a distinct visual treatment (`howto-row is-meta`) so Goal / Scoring read as tone, not
as fake keys. No slug on `how_to_play_opened`; streams stay unjoinable.

## Rollout

| Phase                | What                                                                                                                                                                                                                                                                                 | Seal                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **0 — Convention**   | This doc; skill + copilot rule in games repo                                                                                                                                                                                                                                         | Agents know the shape                    |
| **1 — Soft seal**    | Validate Check 32: _if_ `.legend-keys` exists, Goal + i18n required                                                                                                                                                                                                                  | Pilots cannot ship a legend without Goal |
| **2 — Templates**    | Land / extend [games#172](https://github.com/gamedevpl/www.gamedev.pl-games/pull/172) so `npm run create` scaffolds legend + Goal                                                                                                                                                    | New catalog games start rich             |
| **3 — Catalog**      | Agent batch: add `.legend-keys` + Goal (+ Scoring where natural) to existing games                                                                                                                                                                                                   | Coverage grows                           |
| **4 — Hard seal**    | Check 32 requires `.legend-keys` (and thus Goal) on every published game                                                                                                                                                                                                             | Missing how-to-play fails the gate       |
| **5 — Creator path** | Keep games-repo `npm run create` / pack-kit templates and the agent contract (skills, game-builder) emitting `.legend-keys` + Goal — that is the production path for creator specs. Do **not** treat public-repo `packages/game-generator` (mock / local preview only) as this seal. | Creator deliveries match catalog         |

Phase 4 waits until Phase 3 is near-complete — flipping the hard seal early fails CI for
~90 games at once.

## Out of scope

- Nested SPEC frontmatter for goal/scoring
- Kit protocol changes for prose
- Per-game open-rate joins (privacy)
- Wiring Goal into `packages/game-generator` mock templates (dev preview only; not production)

## Done when

Every published game has a localized Goal in `.legend-keys`, games-repo create / pack-kit /
agent scaffolds emit it by default, and Check 32 fails a game that ships without it.

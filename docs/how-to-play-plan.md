# Richer how-to-play — plan

> Decision: prefer a richer card tone (goal, optional scoring / per-mode) over a flat
> key→action list alone. Tracked as [#395](https://github.com/gamedevpl/www.gamedev.pl/issues/395);
> Visit funnel numbers from [#402](https://github.com/gamedevpl/www.gamedev.pl/pull/402) still
> inform discoverability and whether the card is answering people, but they no longer
> gate _whether_ to ship the richer format.

## Shape (games own the prose)

Richer content lives in the game's `.legend-keys` markup — already scraped by the player
bridge, already localized, **zero GameKit bytes**. Do not put goal/scoring into
`controlsManifest()` (input facts only; kit budget is tight). Legend CSS lives in the
games-repo `shared/game-shell.css` (not copied per game).

Reserved `dt` labels (English canonical + Polish twin):

| Role    | `data-i18n-en` | `data-i18n-pl` | Required?             |
| ------- | -------------- | -------------- | --------------------- |
| Goal    | `Goal`         | `Cel`          | **Yes** on every game |
| Scoring | `Scoring`      | `Punkty`       | Optional              |
| Mode    | `Mode: …`      | `Tryb: …`      | Optional, repeatable  |

Key rows stay as today (`← →` → Move — only keys the game actually binds). SPEC `controls:`
remains the short English catalog / LLM string — keep it in sync with the legend, do not
replace it with nested YAML (frontmatter is flat).

## Host

The theater card already renders every legend `dt`/`dd` as a `ControlRow`. Reserved labels
get a distinct visual treatment (`howto-row is-meta`) so Goal / Scoring read as tone, not
as fake keys. No slug on `how_to_play_opened`; streams stay unjoinable.

## Rollout

| Phase                | What                                                                                                                                 | Status                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| **0 — Convention**   | This doc; skill + copilot rule in games repo                                                                                         | ✅                    |
| **1 — Soft seal**    | Validate Check 32: _if_ `.legend-keys` exists, Goal + i18n required                                                                  | ✅ games #398         |
| **2 — Templates**    | `npm run create` scaffolds legend + Goal ([games#421](https://github.com/gamedevpl/www.gamedev.pl-games/pull/421), forked from #172) | ✅                    |
| **3 — Catalog**      | `npm run howto:migrate` — Goal from `#game-desc`, rows from `.hint`; media hashes refreshed                                          | ✅ companion games PR |
| **4 — Hard seal**    | Check 32 requires `.legend-keys` (and thus Goal) on every published game                                                             | ✅ companion games PR |
| **5 — Creator path** | Templates + pack-kit + `game-builder` / §12a emit and require the same markup                                                        | ✅ companion games PR |

## Generated `index.html` (schema, not markup)

`index.html` is a build artifact derived from GAME.json `howToPlay`, not an authored file.
Games declare the schema; the body fragment is generated.

**Two implementations, one output.** Neither repo can import the other, so the generator
exists twice:

| Repo    | File                                           |
| ------- | ---------------------------------------------- |
| website | `apps/api/src/catalog/index-html-generator.ts` |
| games   | `tools/lib/index-html.ts`                      |

Divergence is silent and worse than a contract mismatch: the games repo would write one
body and the website generate a different one at serve time, so the game a creator
approved is not the game players get. Both repos therefore commit the **same fixture and
golden** (`index-html-contract.json` / `.expected.html`) and assert their own generator
reproduces it byte-for-byte. Whichever copy drifts fails in its own repo, on its own PR.
Changing output means regenerating the golden in both repos in the same change.

**DOM contract the generated fragment preserves** (established by the hand-authored files):

- ids `game-title`, `game-desc`, `sound-toggle`, `game`, `game-status`
- classes `wrap`, `game-controls`, `sound-toggle`, `legend`, `legend-card`, `legend-title`,
  `legend-keys`, `legend-close`, `hint`, `sr-only`
- `data-i18n-en/pl` and `data-i18n-aria-label-en/pl` attributes
- canvas: `id="game"`, width/height (default 640×400), `tabindex="0"`, `role="img"`
- `#game-status` is `class="sr-only" aria-live="polite"`; `#sound-toggle` is
  `aria-pressed="false"` with a bilingual "Sound: On" label

A monolingual key renders bare (`<dt>M</dt>`) — there is nothing to translate. Only keys
that differ between languages carry `data-i18n-*`, matching all 103 hand-authored games.

Row order is fixed: custom controls, Goal, Scoring, Mode, then M, Enter‑R, Touch.

The M / Enter‑R / Touch rows always render with their default wording unless the schema
says otherwise — never inferred from a custom control's own key text ("R" or "M" appearing
in some other row's keys is not evidence it plays that role; games#247 class of bug). To
change or drop one: `howToPlay.sound` / `.playAgain` / `.touch`, each `{en, pl} | false`.
`false` omits the row entirely (a game with no on-screen pad sets `touch: false`); an
`{en, pl}` object rewords it (a game whose Enter/R does something other than "play again").

`howToPlay` and `title` may each be a plain string (same text in both languages) or an
`{en, pl}` object. A bilingual `title` overrides `SPEC.md`'s `title:` field for display —
that field stays the single canonical English name used elsewhere (catalog, prompts); the
schema's `title` is what actually renders in the page when it differs, matching what some
games' hand-authored `index.html` already did. `canvas.ariaLabel` overrides the default
`"{title} playfield"` / `"{title} — pole gry"` pair when a game wants a more specific label.

**Delivery.** New work satisfies the markup requirement with a `howToPlay` carrying both
`goal` and `hint`; agents cannot stage, patch, or directly submit `index.html`. Generation
happens inside `getGameSources`, the single point every assembly path converges on (gate,
staged preview, remix, seed preview, published serve, snapshot bake), so no caller needs to
generate the file. A legacy `index.html` carried forward from an older delivery still wins,
and stored snapshots keep working untouched — no backfill.

## Out of scope

- Nested SPEC frontmatter for goal/scoring
- Kit protocol changes for prose
- Per-game open-rate joins (privacy)
- Wiring Goal into `packages/game-generator` mock templates (dev preview only; not production)
- Hand-polishing every migrated key row (agents can tighten Scoring/Mode later)

## Done when

Every published game has a localized Goal in `.legend-keys`, games-repo create / pack-kit /
agent scaffolds emit it by default, and Check 32 fails a game that ships without it.

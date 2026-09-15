# Catalog effort score

Bake-time 0..1 score of how much work is in a repo-lane game. The homepage
**Recommended** sort uses it as the primary term, then the existing community
score (see [`recommendations.md`](./recommendations.md)).

This file is the formula. Keep
[`apps/api/src/catalog/catalog-effort.ts`](../apps/api/src/catalog/catalog-effort.ts)
and the games-repo `tools/lib/effort.ts` in lockstep with it.

## Inputs

| Signal        | What is counted                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **loc**       | Code lines in `games/<slug>/game.ts` plus `games/<slug>/game/**/*.ts` (blanks and `//` comments excluded — same rule as games-repo `npm run loc`)         |
| **artifacts** | `TRACE.json` `frames` + `ACCEPTANCE.json` `achieved.length` + `PLAYTEST.json` `expectProgress.length` + PNG files under `games/<slug>/media/`             |
| **commits**   | `git rev-list --count HEAD -- games/<slug>/` (games-repo tool). Snapshot bake asks GitHub GraphQL for the same path history. Missing history counts as 0. |

Each missing file or failed parse is 0, not an error.

## Formula

For each input independently, log-normalise against the catalog max:

```
norm(x) = log1p(x) / log1p(maxX)   // 0 when maxX is 0
```

Then:

```
effort = 0.50 * norm(loc) + 0.30 * norm(artifacts) + 0.20 * norm(commits)
```

Rounded to three decimal places, clamped to `[0, 1]`. A game that leads every
axis scores `1`; a game with nothing measurable scores `0`.

## What this is not

- **Not** Firestore builder round counts. Those live on the platform
  (`apps/api/src/store/slices/rounds.ts`) and would add a cross-repo read on
  every bake. v2: pass `rounds` as a fourth input (weight ~0.15, taken from
  loc) once the bake already has a store handle.
- **Not** shown in the UI. The number is a ranking signal, optional on
  `CatalogEntry`.
- **Not** applied to newest / most played / A–Z.

Store-lane games have no games-repo tree, so they omit `effort` and rank as 0.

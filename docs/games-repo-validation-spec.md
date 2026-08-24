# Games Repository PR Validation Specification

> **Target Repository:** `gamedevpl/www.gamedev.pl-games`
> **Workflow:** `.github/workflows/validate.yml`

This specification defines the quality gates enforced on incoming pull requests submitting or modifying games in the dedicated games repository.

## Enforced Gates

### 1. SPEC.md Frontmatter & Structure Validation

- Verify `SPEC.md` exists and contains required YAML frontmatter fields matching [`docs/games-repo-blueprint.md`](./games-repo-blueprint.md) §2:
  - `title` (string)
  - `slug` (string, must match directory name)
  - `status` (`draft` | `in-progress` | `published`)
  - `genre` (string)
  - `controls` (string)
  - `submitted_by` (GitHub handle string or `null`)
    _(Note: Field schema is defined in `games-repo-blueprint.md` §2; confirm against a live `SPEC.md` in `gamedevpl/www.gamedev.pl-games` when implementing `validate.yml`.)_
- Ensure `index.html` entrypoint is present in the game directory.

### 2. Game Bundle Size Cap

- Hard failure if the author's own bytes exceed 237,568 (232 KiB). Games-repo Check 4
  measures those as `assembled − platformBytes` (selected GameKit modules, inlined audio,
  shell CSS) — a platform change cannot break a published game whose author spent nothing.
- On top of that sits a single serve-compat platform ceiling for the touch pad, restart
  button, music glue, opt-in reserves, and friends. The served cap is author budget +
  that ceiling. The live numbers are `GAME_BUDGET_BYTES` and `GAMEKIT_PLATFORM_BYTES` in
  `apps/api/src/platform/games-repo-contract.ts`, which `apps/api/src/platform/assemble.ts` re-exports as
  `MAX_PROJECT_BYTES` — do not restate them here, or this page becomes a third copy to
  keep in lockstep.

#### Raising the cap: merge the website half first

A budget move is two PRs, and the order they land in is not a matter of taste.

Merging the games-repo half first opens a window where the build-time ceiling is higher
than the serve-time one. Any game that grows into that gap passes `validate` over there
and then fails to bake here — and the failure is quiet, because a partial bake
deliberately leaves the pointer on the previous snapshot. The site keeps serving, the
catalog looks right, and nothing published moves until somebody re-runs the publish. The
symptom is not an error page; it is games merged hours ago that never appear.

Merging the website half first inverts it harmlessly. A serve cap above the build cap
means no game can be assembled that this side would refuse, so the window is empty and
the games-repo merge publishes on its own dispatch with nothing to recover.

This is not hypothetical: it is what happened when `zone` got its reserve (games-repo
#163 / website #339), and the recovery was a manual `workflow_dispatch` of
`publish-games.yml`. See `docs/games-snapshot.md` for that escape hatch.

### 3. Headless Browser Boot Smoke Test

- Run a headless browser test (JSDOM / Playwright) loading `index.html`.
- Assert that:
  - Document reaches `DOMContentLoaded` / `load` state.
  - No uncaught JavaScript errors or unhandled promise rejections are logged to `console.error` or window error handlers within 3 seconds of load.

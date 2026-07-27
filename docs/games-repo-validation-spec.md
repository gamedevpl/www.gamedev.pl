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

- Calculate total byte size of all files in the individual game directory.
- Hard failure if the author's own bytes exceed 204,800 (200 KiB).
- On top of that sits the GameKit platform allowance — the touch pad, restart button,
  music glue and friends that every assembled game carries whether it asked or not.
  Charging those to the author would silently shrink what they may write, so the served
  cap is author budget + allowances. The live numbers are `GAME_BUDGET_BYTES` and
  `GAMEKIT_PLATFORM_BYTES` in `apps/api/src/games-repo-contract.ts`, which
  `apps/api/src/assemble.ts` re-exports as `MAX_PROJECT_BYTES` — do not restate them
  here, or this page becomes a third copy to keep in lockstep.

### 3. Headless Browser Boot Smoke Test

- Run a headless browser test (JSDOM / Playwright) loading `index.html`.
- Assert that:
  - Document reaches `DOMContentLoaded` / `load` state.
  - No uncaught JavaScript errors or unhandled promise rejections are logged to `console.error` or window error handlers within 3 seconds of load.

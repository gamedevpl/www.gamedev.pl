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

### 2. Game Bundle Size Cap (`MAX_PROJECT_BYTES = 200 * 1024`)

- Calculate total byte size of all files in the individual game directory.
- Hard failure if total size exceeds 204,800 bytes (200 KB).
- This aligns with the submission API's `MAX_PROJECT_BYTES` constant in `apps/api/src/assemble.ts`.

### 3. Headless Browser Boot Smoke Test

- Run a headless browser test (JSDOM / Playwright) loading `index.html`.
- Assert that:
  - Document reaches `DOMContentLoaded` / `load` state.
  - No uncaught JavaScript errors or unhandled promise rejections are logged to `console.error` or window error handlers within 3 seconds of load.

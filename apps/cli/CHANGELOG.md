# gamedevpl CLI changelog

One line per change, written for a creator reading `gamedevpl update`. The category
decides the next version — see [`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md):
**Breaking** and **Added** bump minor (major once 1.0 exists), **Fixed** bumps patch,
**Internal** never cuts a release. Merging the auto-opened `release(cli)` PR is the cutoff.

## Unreleased

### Fixed

- `gamedevpl` prints the version it actually is; every release so far reported 0.1.0 in the banner, footer and `help`

## 0.3.0 — 2026-09-05

### Added

- Checkout, OAuth refresh and the delivery loop are closed end to end (#1173)
- A device that signs in again reuses its OAuth grant instead of minting another (#1168)

## 0.2.0 — 2026-09-04

### Added

- `gamedevpl help` describes every verb, and the REPL paints an idle mascot (#1164)

### Fixed

- `gamedevpl login` no longer crashes when the browser hand-off fails (#1164)

## 0.1.0 — 2026-09-04

First public release: the `gamedevpl` REPL on Ink, OAuth `creator` login with keychain
storage, delegation to `claude` / `codex` / `gemini` / `vibe` behind the static ladder,
verb mode with `--json` and exit codes, checkout `pull` / `diff`, and `gamedevpl update`.

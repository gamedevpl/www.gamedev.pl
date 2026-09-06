# gamedevpl CLI changelog

One line per change, written for a creator reading `gamedevpl update`. The category
decides the next version — see [`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md):
**Breaking** and **Added** bump minor (major once 1.0 exists), **Fixed** bumps patch,
**Internal** never cuts a release. Landing on `master` with unreleased entries cuts and publishes.

## Unreleased

### Added

- `gamedevpl play` and `/play` open a game with local live reload; “chcę zagrać” opens the current game without dispatching a build (#1184)

- Choose an installed agent before creating a game or dispatching a revision; all seven bundled agents support local builds, with automatic checkout preparation when needed (#1181)
- Copilot gains temporary MCP setup; launches validate required flags and report anonymous delegation funnel events (#1181)
- `gamedevpl agents` lists installed tools and local-file/MCP support; the REPL offers every available checkout agent and an agent picker for `/connect` (#1181)
- Started in a game checkout, `gamedevpl` opens that game instead of asking what to make
- In a checkout, saying what to change runs `claude` / `codex` / `gemini` / `vibe` from your machine on the game,
  verifies the tree and offers to deliver; `/delegate <task>` skips the chat, `/builder self|platform` picks who builds,
  and `gamedevpl delegate "<task>" [--submit]` does the same non-interactively

### Fixed

- Live preview rejects unsafe session files, cancels startup, handles concurrent starts and large bundles, and stays off during unattended delegation (#1184)
- Boolean flags preserve positional arguments; CLI play telemetry has an operator label (#1184)

- Cancelling connection stops before handoff; pending handoffs preserve the selected agent and task for `/retry` (#1181)
- MCP agents run without a checkout in a scratch directory that remains available afterwards (#1181)
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

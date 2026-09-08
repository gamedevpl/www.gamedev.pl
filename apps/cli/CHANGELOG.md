# gamedevpl CLI changelog

One line per change, written for a creator reading `gamedevpl update`. The category
decides the next version — see [`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md):
**Breaking** and **Added** bump minor (major once 1.0 exists), **Fixed** bumps patch,
**Internal** never cuts a release. Merging the auto-opened `release(cli)` PR is the cutoff.

## Unreleased

### Added

- Interactive slash-command suggestions filter as you type; arrows select and Tab completes without running the command.

## 0.9.0 — 2026-09-08

### Added

- Connect opens an interactive game session with local checkout, chat and agent choices; `--manual` prints MCP setup (#1223).

### Fixed

- Missing-game errors explain how to start creating a new game (#1223).
- `/checkout` opens the downloaded game in the current session and supports games before their first delivery (#1223).
- Checkout refuses non-empty destinations to preserve existing files (#1223).

## 0.8.0 — 2026-09-07

### Added

- The pilot funnel records signing in, a first turn, a publish it watched happen, and one install per machine — the operator page reads them (#1222).

## 0.7.0 — 2026-09-07

### Added

- Game checkouts offer Creator Kit updates at startup; `/kit` installs the new tools and dependencies while preserving local game edits (#1213).

## 0.6.1 — 2026-09-07

### Fixed

- Custom adapter names no longer block conversational requests; oversized optional agent metadata is omitted (#1189).

## 0.6.0 — 2026-09-07

### Breaking

- Claude delegation requires a verified Claude.ai subscription login; inherited API and cloud-provider credentials are no longer used (#1201).

### Fixed

- Claude subscription checks accept setup-token logins, stay responsive and explain incompatible CLI versions (#1201).
- Local agent choices survive failed requests (#1201).
- Live status follows new rounds and reports the active agent and tool (#1201).
- Verification errors retain filenames and full diagnostic details (#1201).
- Antigravity events are readable and an empty run with denied permissions cannot claim success (#1201).
- Partial Claude tool refusals do not prevent verification of completed edits (#1201).
- Session resume instructions identify the correct agent (#1201).

## 0.5.1 — 2026-09-07

### Fixed

- Short edit requests are accepted and conversational improvement replies appear directly in the CLI (#1190).
- Published-game edits open an improvement round with the selected builder instead of targeting a closed round (#1190).

## 0.5.0 — 2026-09-06

### Added

- The TUI shows animated activity, elapsed time and current steps while working, with persistent controls in compact terminals (#1193).

## 0.4.1 — 2026-09-06

### Fixed

- The conversational assistant interprets play, status and edit requests using the active game context, including published checkouts (#1187).

### Internal

- Release packaging builds the shared contract before bundling the CLI (#1186).

## 0.4.0 — 2026-09-06

### Added

- `gamedevpl play` and `/play` open a game with local live reload; “chcę zagrać” opens the current game without dispatching a build (#1184)

- Choose an installed agent before creating a game or dispatching a revision; all seven bundled agents support local builds, with automatic checkout preparation when needed (#1181)
- Copilot gains temporary MCP setup; launches validate required flags and report anonymous delegation funnel events (#1181)
- `gamedevpl agents` lists installed tools and local-file/MCP support; the REPL offers every available checkout agent and an agent picker for `/connect` (#1181)
- Started in a game checkout, `gamedevpl` opens that game instead of asking what to make
- In a checkout, saying what to change runs `claude` / `codex` / `gemini` / `vibe` from your machine on the game, verifies the tree and offers to deliver; `/delegate <task>` skips the chat, `/builder self|platform` picks who builds, and `gamedevpl delegate "<task>" [--submit]` does the same non-interactively

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

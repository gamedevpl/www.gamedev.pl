# gamedevpl CLI changelog

One line per change, written for a creator reading `gamedevpl update`. The category
decides the next version — see [`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md):
**Breaking** and **Added** bump minor (major once 1.0 exists), **Fixed** bumps patch,
**Internal** never cuts a release. Merging the auto-opened `release(cli)` PR is the cutoff.

## Unreleased

### Fixed

- Move the prompt cursor with the left and right arrow keys and edit long messages in place (#1290).
- Show each local agent's model and reasoning effort in the task picker, with an inline path to change them.

## 0.14.1 — 2026-09-12

### Fixed

- Recover Muse tasks waiting for approval by offering to resume the same session interactively (#1271).
- Open a running local preview with `o` when terminal links cannot be clicked (#1277).

## 0.14.0 — 2026-09-11

### Added

- Configure remembered sandboxed headless permissions before starting local Antigravity tasks (#1267).

### Fixed

- Recalling slash commands keeps arrow keys available for history and restores your unfinished input (#1233).
- Agent output hides empty Codex item lifecycle events instead of printing `item.completed` (#1233).
- Explain a delivery refused for its wording, and tell a paused content check apart from a rejection.

## 0.13.1 — 2026-09-11

### Fixed

- Explain how to retry uploads when source storage is busy (#1263).
- Distinguish interactive takeover commands from shell commands (#1263).

## 0.13.0 — 2026-09-10

### Added

- Use `/push` or `gamedevpl push` to deliver local changes as a preview; `/submit` remains supported (#1255).

### Fixed

- Notify about newer CLI releases when an interactive session starts, without blocking work (#1260).

- Make terminal conversations easier to scan with colored roles, checks, links and clearer spacing (#1259).
- Summarize repeated tool activity while preserving every operation in `/logs` (#1259).
- Wrap clickable preview links within narrow terminals (#1259).
- Recover preview delivery from an open own-agent session with explicit takeover confirmation (#1256).
- Continue existing local checkouts from connect instead of silently using platform sources (#1252).
- Show meaningful Codex MCP and file activity instead of item.completed (#1252).
- Open Codex MCP interactively so permission requests can be answered (#1252).

## 0.12.0 — 2026-09-08

### Added

- Show local agent activity and lost CLI contact in the Studio connection guide (#1243).
- Keep interactive Antigravity terminal output in /logs on macOS and Linux (#1243).
- Resume blocked Antigravity tasks interactively in the terminal to answer permission prompts, then return to verification (#1243).
- Choose and remember delegated agent model and reasoning effort with `/model` or `gamedevpl model` (#1243).
- Open the full local task transcript with `/logs` while the main view shows concise progress (#1243).

### Fixed

- Wait for the final local task status before exiting the CLI (#1243).
- Show model command help without changing saved settings (#1243).
- Show Claude session resume instructions once instead of repeating them on every system event (#1243).
- Group local task output and reduce setup and shell-command noise in the terminal (#1243).
- Return local validation errors to the selected agent for up to two automatic repairs before offering delivery (#1243).
- Keep Ctrl+C responsive while local validation runs (#1243).
- Show local agent ownership separately from Studio status while editing and verifying (#1243).
- Preserve complete agent responses instead of truncating them to 240 characters (#1243).
- Stream Muse responses and tool activity instead of waiting silently for its final answer (#1243).
- Show time since the last output when a running task stops reporting progress (#1243).
- Keep terminal history stable while the activity spinner updates, so preview URLs can be selected and copied (#1243).
- Render preview URLs as clickable hyperlinks in terminals that support them (#1243).

## 0.11.0 — 2026-09-08

### Added

- Detect Muse Code and delegate local checkout tasks with `--agent muse` (#1234)

## 0.10.1 — 2026-09-08

### Fixed

- `gamedevpl update` sorts release versions by semver instead of tag list order (#1238).

## 0.10.0 — 2026-09-08

### Added

- Interactive slash-command suggestions filter as you type; arrows select and Tab completes without running the command (#1231).

### Fixed

- Agent failures explain model capacity errors and offer reconnection to the existing MCP round instead of suggesting submit (#1231).

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

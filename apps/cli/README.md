# gamedevpl CLI (apps/cli)

Terminal front door for gamedev.pl. **No local model.** Coding happens by delegating to a
vendor CLI the creator already has, or by the platform builder.

This package lives in the public app monorepo. A separate `gamedevpl/gamedev-cli`
repo is not planned. On the site: [www.gamedev.pl/connect](https://www.gamedev.pl/connect)
(header menu → Connect an agent).

## Install

Needs **Node 20+** — the same runtime a game checkout already requires. The installed
file is a shebang script, not a native binary (no Apple/Windows code signing).

```bash
curl -fsSL https://www.gamedev.pl/install.sh | bash
```

The installer is 404 until the `CLI_SURFACE` deploy flag is on. Checksums come from GitHub
Releases tagged `cli-v*` carry the standalone `gamedevpl` script and an npm-installable
`gamedevpl-npm.tgz` archive. Both contain the same bundled CLI. `gamedevpl update`
updates the standalone script and, when the current project depends on `@gamedevpl/cli`,
its npm package, manifest and lockfile. `npm exec -- gamedevpl` then uses the same
version. Downloads are checked against release checksums; npm installs skip lifecycle
scripts. Run the update from your game directory.

During `gamedevpl update`, a terminal spinner shows the current step and elapsed time.
Redirected output uses plain step messages; `/update` shows the steps in its activity
panel. `--json` stays free of progress output. Update requests time out after two minutes
with a retry hint; release notes keep their separate three-second limit.

After installing, `gamedevpl update` shows the old and new versions and the Breaking,
Added and Fixed entries from every intervening release, newest first. The changelog
comes from the installed version's release tag, with a link to the full file. If notes
cannot be fetched within three seconds, installation still succeeds and shows the link.
Reinstalling the same version reports no version change; a downgrade shows only the
target release's notes. `--json` returns one object with a structured `releaseNotes`
field. `/update` also reminds you to restart the current session.

Play sessions and terminal commands coordinate token refresh through a private lock
beside the credential file. A process rereads saved credentials after acquiring the
lock and uses the refreshed token if another process already renewed it. Login,
logout and credential writes use the same lock; credential files are replaced
atomically so readers see a complete old or new record. A lock left by an exited
process is recovered automatically, while a live owner is allowed to finish.

The REPL talks to `POST /api/cli/chat` on the API. Model keys stay on the server. A game
starts only when that chat decides you asked for one.

In the terminal session, typing `!` switches the input to a visibly marked Shell mode.
Enter runs the command; Esc or Backspace on an empty command returns to conversation.
`!<command>` runs a local shell command, for example `!pwd`,
`!git status` or `!npm test`. Commands use the current game checkout (or the launch
directory before selecting a game), the user's shell and environment. Output appears
in the transcript with the exit code; Ctrl+C stops the command and its child processes.
Commands work offline and are not sent to the assistant. Each invocation uses a fresh
shell, so `cd` and exports do not persist. Output is batched and capped at 256,000
characters or 2,000 lines;
redirect to a file for larger reports. While an agent works, Enter queues a shell
command until the task finishes. Browser chat does not execute shell commands.

Interactive sessions save the last 200 output lines and 50 prompts locally under
`~/.config/gamedevpl/history/`, with owner-only file permissions. History is separated
by signed-in account, server, and game (or launch directory before selecting a game).
Restarting restores the transcript and ↑/↓ prompt history without executing old commands
or reconnecting old preview URLs. The platform conversation ID is also retained. The server keeps up to eight recent
conversations per account within a bounded storage budget; older conversations start
fresh when their IDs expire. This does not resume a delegated agent's own session. If the account cannot be verified,
history stays in memory for that run. Set `GAMEDEV_HISTORY=off` to disable disk history;
remove the history directory to erase saved conversations. Avoid putting secrets in prompts.

While a local Codex or Muse task works, Enter sends your message into its active
turn. The UI confirms acceptance only after the agent acknowledges it; this does not
mean the requested change is already implemented. Ctrl+Q instead queues a separate
request for after the task and its confirmation prompts finish.

Claude, Copilot, Agy, Vibe, and other adapters currently support queued follow-ups
only; their input says “Follow-up after this task” and Enter queues the request.
Codex uses its app-server protocol and Muse uses MSP (`serve`); update the agent if
its installed version does not support that protocol. A failed live run is never
silently retried as a new task.

Ctrl+O opens the preview while typing. Ctrl+C stops the task and clears its queue.
Unsent text survives intermediate choice prompts. Pending requests are kept only
for the current CLI run. Unconfirmed messages are saved in the transcript and
prompt history without overwriting newer edits in the editor. If delivery times
out or the connection closes, acceptance may be unknown: check the transcript
before resending. Queued requests do not resume the agent's internal conversation.

Until a release exists, from the repo root after a pull:

```bash
npm install
npm run bundle -w @gamedevpl/cli
node apps/cli/dist/gamedevpl.mjs help
```

`ink` is a workspace dependency. Skipping `npm install` makes esbuild fail with `Could not resolve "ink"`. The bundled script inlines Ink. Interactive `gamedevpl` opens the browser workspace. Use `gamedevpl --terminal` for the TUI.

The GitHub Release also carries `gamedevpl-npm.tgz`, a self-contained npm package
with `gamedevpl` and `git-remote-gamedevpl` bins. A Creator Kit can pin its
versioned release URL in `devDependencies` and lock it with `npm ci`; users then
run `npm exec -- gamedevpl ...` inside that checkout. No npm Registry publication
is involved.

## Verbs

`login` `logout` `whoami` `agents` `games` `status` `share` `profile` `handle` `builder`
`connect` `delegate` `checkout` `pull` `diff` `push` `publish` `submit` `quota` `notifications` `update` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

`gamedevpl login` opens the browser and receives the token on a local callback
(OAuth + PKCE). In Codespaces, SSH and environments without a display it uses
OAuth Device Flow instead: it prints a link and code, you approve on gamedev.pl
and the CLI receives the token without a localhost callback. Keep the terminal
open; Ctrl+C cancels. Use `--no-browser` to open the link yourself, and
`--loopback` or `--device-flow` to pick the flow explicitly. The token stays on
this machine. CI still uses `GAMEDEV_TOKEN` from secrets.
Never pass the creator OAuth token to a sub-agent.
`git push` / `git pull` against a checkout use `git-remote-gamedevpl` (same script).

## Local agents

`gamedevpl agents` (or `/agents` in the REPL) checks executable files on `PATH` and
lists the configured local-file and MCP modes. `--json` works without sign-in or a
TTY. Discovery does not start a build. Launch checks the installed tool's help for
required flags and refuses incompatible versions before a handoff. Provider login
stays with the selected tool; its authentication errors are shown in the terminal.
Runs use that tool's own credentials and billing.

The bundled local adapters are `claude`, `codex`, `gemini`, `vibe`, `agy`, `cursor`,
`copilot`, `muse`, and `opencode`. Automatic MCP configuration is available for `claude`, `codex`, and
`copilot`; the others use local files. Cursor runs `cursor-agent`, or `agent` only
after its help identifies it as Cursor. The `cursor` editor launcher is listed
separately and is never treated as a headless agent. Windsurf is also listed as an
editor with manual MCP setup (`gamedevpl connect <slug> --manual`), not as a
headless delegate. The builder picker only shows detected execution adapters.

OpenCode uses [`opencode run --format json`](https://opencode.ai/docs/cli/).
Choose a provider/model ID with `/model opencode`; provider-specific reasoning
variants and permissions stay in OpenCode's settings. No blanket auto-approval
is enabled. Prompts typed during a run are queued for the next task.
Copilot output shows complete replies, tool activity, and failures; protocol
deltas and lifecycle notifications stay out of the conversation.
Custom local adapters can be configured in `~/.config/gamedevpl/adapters.json` (or
`GAMEDEV_ADAPTERS`); they remain unsupported and do not gain automatic MCP wiring.

Inside a checkout, the builder picker lists every detected adapter and carries the
selection into the first task. Subsequent tasks ask which agent when several exist.
The conversation prepares a new game or revision before dispatch, then offers an
agent or the platform builder. Without a checkout, agents use MCP when supported;
otherwise the CLI downloads a checkout, installs its pinned kit and toolchain, and
runs the local editing/verification/delivery flow. New games bootstrap from the brief
and pinned Creator Kit without requiring a previous delivery. Pending handoffs retain
the task and selected agent; `/retry` resumes them after ownership changes. `/connect <slug>` also offers
installed MCP adapters or manual setup. Explicit `--agent` skips the picker. Cancelling a picker
does not launch an agent or request a handoff. One-shot commands never prompt.

Anonymous `delegate_offered` / `delegate_used` events measure the choice and launch;
`verify_failed` and `delivered` cover validation and delivery results. Platform source
validation failures omit the local check stage. They use the existing visit
endpoint and a process-local random visit ID, with closed adapter/stage dimensions.
No credentials, inventory, executable paths, game identifiers, or prompts are sent.
The existing CLI funnel rollup measures offered-to-used conversion by adapter.
Telemetry failures never block the task.

## Working copy

`gamedevpl checkout <slug>` writes `.gamedev-slug` and `.gamedev-base.json` (the platform
version the copy was taken from). `diff`, `pull`, and `submit` share that three-way
model:

- **local-only** — your edits; `submit` delivers them. `pull` keeps them.
- **platform-only** — the site moved; `pull` is safe.
- **both** — different files; `pull` keeps yours and takes theirs.
- **conflict** — the same path changed on both sides. `pull` attempts a three-way
  text merge using the recorded platform base. Independent edits within a file combine;
  overlapping edits, conflicting binary changes and add/delete conflicts stop before
  writing any source files or advancing the base. `--force` explicitly replaces local sources.

`gamedevpl pull` and `/pull` in a connected session use the same merge. Successful merges
report `Auto-merged` paths and keep local edits available for `diff` and a later `push`.
They update the synchronization base to the downloaded platform tree, preserving the
difference between your merged draft and the platform. No Git commits, refs or index
entries are changed, and nothing is delivered or published.

Merging overlapping paths requires Git on `PATH` and access to the historical base.
The CLI verifies base hashes, preserves ignored files, and refuses symbolic links or
source snapshots over 32 MB, 2000 files or 2000 directories during a merge. Source and
metadata edits or a newer platform delivery detected during merging refuse the pull.
If a merge conflicts, use `gamedevpl diff` to review both sides and reconcile the changes
before retrying. No conflict markers are written into your game.

`status` with no token, inside a checkout, lists local edits, incoming platform changes
and conflicts in separate groups, with one path per line and added/modified/deleted labels.
Interactive `/status` uses the same working-copy report and then adds the current round's
status when connected. A failed round read leaves the working-copy report visible.
Both commands find the checkout from its subdirectories. `diff` and `/diff` show the
same patch, from the platform version to local files. Terminal output uses Git-like
colors; redirected output and `NO_COLOR=1` are plain. `--json` preserves the raw report
without colors or the interactive round supplement.
Interactive diffs open in a separate browser flyout or a TUI viewer instead of filling
the conversation. In the TUI, use arrows or PgUp/PgDn to scroll, `q` or Esc to close,
and Ctrl+D to reopen the latest diff. Browser cards reopen the selected diff.
The last eight diffs remain available during the session; local conversation history
stores a reminder to rerun `/diff`, without saving patch contents.
Both skip files the checkout is not supposed to deliver. `.git` is never uploaded. `.gitignore`
is honored, and `.gamedevplignore` adds rules in the same syntax after `.gitignore` in each
directory. A path already recorded in `.gamedev-base.json` stays tracked when a pattern matches
it. `push` names anything it left out, so a scratch file does not vanish quietly. `pull` refuses
when an ignored file on disk would be overwritten (`pull --force` replaces those files and still
will not write `.git`). A platform file that only matches an ignore rule, and is not already
in the checkout, stays unwritten and is named. `checkout` says when a platform file landed on
an ignored path. Paths already in `.gamedev-base.json` stay tracked.

A checkout without `.gamedev-base.json` is **legacy**: matching trees are adopted; anything
else is refused so pull cannot guess. `status`, `diff` and the refusal explain how to
choose a source copy: review `gamedevpl diff`, then back up the local game sources
(`src/` in a source repository, `games/<slug>/` in a standard checkout).
`gamedevpl pull --force` replaces those sources with the platform copy and records a
base version for later pulls. To deliver the local copy instead, use `gamedevpl push --force`.

## Delivered source history

History reads work without a local Git repository. Inside a checkout the CLI finds
the game, including from subdirectories. Elsewhere, supply `--slug <slug>`; `log`
also accepts the slug as its argument. All commands support `--json` and their
interactive `/log`, `/show`, `/diff` and `/blame` forms.

```sh
gamedevpl log                     # full history, newest first, in a terminal pager
gamedevpl log --oneline           # compact, one line per version
gamedevpl --no-pager log          # print directly
gamedevpl log tabletop-turbos --limit 50
gamedevpl log --since 2026-10-01 --until 2026-10-16
gamedevpl log --grep 'rail|train' -i
gamedevpl log --limit 10 -- game/ai.ts game/model.ts
gamedevpl show <version>          # metadata and patch against the preceding delivery
gamedevpl diff <version1> <version2>
gamedevpl diff --from <version1> --to <version2> --slug tabletop-turbos
gamedevpl blame game/ai.ts        # version that last changed each line
gamedevpl blame game/ai.ts --version <version>
```

`log` separates versions into Git-style blocks with a readable local date,
preview/publication mode, gate outcome and backend/model when available. Change
summaries appear below the metadata, indented and wrapped to the terminal width.
`show` uses the same header before its patch. Colors follow the terminal and
`NO_COLOR`; piped output is plain text. `--oneline` shows the version ID and a
single-line summary, shortened to fit the terminal. `--json` retains the full
metadata and summary, regardless of display options. It lists delivered source versions;
rounds that never delivered sources are not versions. `blame` reports version and
date, not a person or agent identity that the platform cannot establish. Paths
are relative to the game's source root; a full `games/<slug>/...` path also works,
and source repositories accept `src/...`. `show`, version diffs and `blame` require
Git on `PATH` and use a private temporary repository removed after the read.
They leave the current checkout, index and local history untouched.

In a terminal, `log` streams into `less -FRX` (`more` on Windows); use `q` to quit,
arrows or Space to scroll, and `/text` to search in `less`. `PAGER` overrides the
command, including its arguments. `--no-pager` (before or after `log`), `PAGER=cat`,
an empty `PAGER`, non-terminal input/output and `TERM=dumb` disable paging. A missing
default pager falls back to plain output; a failing custom pager reports an error.
Quitting the pager cancels further history reads. Interactive `/log` uses the
session's own scrollback. Piped output and `--json` never start a pager.
Text output waits for slow pipe readers; closing the reader cancels further reads.
If a history read fails after paging starts, close the pager to see the error;
the CLI waits for the pager to release the terminal before returning.

`--since` and `--until` accept ISO dates or timestamps, inclusively; dates without
a time cover the whole local day. `--grep` matches the full change summary as a
regular expression; add `-i` or `--ignore-case` for case-insensitive matching.
Arguments after `--` select literal source files or directories (no glob expansion).
The path filter compares each delivery with its immediate predecessor, including
additions, deletions and binary changes; it can require additional source reads.
Multiple paths match any selected path; dates, summary and path filters combine.
`--limit N` counts matching versions, after filtering. The default reads all pages;
`--all` remains an alias for that default and cannot be combined with `--limit`.

Plain `gamedevpl diff` still compares platform sources with local edits. Two
timestamp version IDs (`v...`) select the version comparison; use `--from` and
`--to` for other version ID formats or to avoid ambiguous positional arguments.

### Restore and revert delivered sources

```sh
gamedevpl restore <version> --dry-run --json  # inspect the complete local change plan
gamedevpl restore <version>                 # replace sources with that delivery
gamedevpl checkout --version <version>      # the same restore, in an existing checkout
gamedevpl revert <version>                  # undo only the changes in one delivery
gamedevpl diff
gamedevpl push                              # deliver the reviewed result as a new preview
```

These commands operate on local sources only. Plain `checkout <slug>` still downloads
a game into a new directory. Both standard `games/<slug>/` checkouts and Creator Kit
source repositories (`src/`) support history edits and their `/restore`, `/checkout
--version` and `/revert` forms. `restore --version <version>` and `revert --version
<version>` are also accepted.

`restore` replaces the complete delivered source tree, including file additions and
deletions. `revert` applies the inverse of the selected delivery against your current
sources, preserving later changes through Git's three-way merge. It requires Git on
`PATH`; overlapping text/binary changes or modify/delete conflicts refuse the operation
before any local source writes. It does not reset the game to the preceding snapshot.

The checkout must have a valid synchronization base matching the latest delivery;
run `pull` first if the platform has moved. Local source edits are refused by default.
`restore --force` permits replacing them and saves a recovery copy; `revert` never
discards drafts with `--force`. Ignored and non-deliverable files are preserved. An
incoming source that would replace an ignored file is refused, even with `--force`.
Historical paths must satisfy the current delivery allowlist. Source repository edits
must retain `SPEC.md` and its bound game slug. Synchronization metadata and the caller's
Git branch, refs and index remain unchanged, so a later `push` creates a new delivery.

`--dry-run` checks the operation and prints the added/modified/deleted paths without
changing the checkout; `--json` returns that plan and, after applying, the recovery path.
Applied changes keep a complete pre-edit copy under `.gamedev/history-backups/`.
Sources and metadata are rechecked after fetching to preserve concurrent editor changes.
History edits reject symlinks and special files in the game source directory; the full
snapshot, including ignored files, is limited to 32 MB, 2,000 files and 2,000 directories.

Ordinary write failures roll back the directory replacement. If the process is
interrupted, run `gamedevpl restore --recover` from the checkout root before another
history edit. It rolls back an unfinished replacement or completes cleanup of a committed
one. Recovery refuses to overwrite edits made after interruption and retains both copies.
Recovery may reclaim a dead writer explicitly marked as a history edit; live writers
and agent-owned writer locks remain protected.

A standard checkout initializes Git and configures `origin`; it does not populate
the current branch's commit history. With `git-remote-gamedevpl` on `PATH`:

```sh
git fetch origin
git log origin/main --oneline
git blame origin/main -- games/tabletop-turbos/game/ai.ts
```

The helper imports a deterministic commit per version into `refs/gamedevpl/`,
which Git maps to `origin/main`. It never updates a local branch. Repeated fetches
reuse imported commits and fetch only new source trees; PNG/WebP files retain
their bytes. Cold imports stream one version at a time. Private refs are separated
by platform origin and game. These commits use `gamedevpl` as author and the version ID as their
message. API pagination includes history beyond 100 versions; rate-limited reads
retry with the server's retry interval, up to three retries per request.

## Round trip

```bash
gamedevpl login
gamedevpl checkout <slug>
# edit games/<slug>/…
gamedevpl diff
gamedevpl pull          # only if the platform moved
gamedevpl submit        # local ladder, then the Code-surface deliver path
gamedevpl status <token-or-slug>
```

`submit` is preview-mode delivery. A green gate is not a publish. `--publish` runs the
full local ladder and delivers `mode=publish`; an operator still publishes.

Typecheck and static checks each have a five-minute limit. The full publication
check has no time limit by default, so extended capture plans can finish.
Set `GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS` to a positive integer to limit that
check, or `0` to keep it unlimited. A timeout reports the command and elapsed
limit; cancellation still stops the check and its child processes.

Delivery progress shows the current stage out of eight, local check counts (two for
preview, three for publish), and file upload counts. For example:
`[2/8] Checking local game 3/3: npm run check:game -- trenchline-command`.
The terminal spinner also shows elapsed time. These counts describe stages, not a
time estimate; delivery ends at platform acceptance and checkout refresh, before
the server gate and operator approval. `--json` omits progress output.

## In a checkout

`gamedevpl` started inside a checkout (any subdirectory) opens that game. It shows the
sync state, available local adapters, and who builds.
If a local agent is found and the platform still builds, it asks once whether to hand the
round to your machine (`/builder self`); `/builder platform` hands it back.

With builder `self`, a plain message goes to the Studio chat first — questions get
answers; a change request runs the local agent in `games/<slug>` with a brief, then the
static ladder, then offers to deliver. The agent never sees the OAuth grant. Ctrl+C stops
the agent, not the session. `/builder` shows the current builder and a choice menu.
`/delegate <task>` skips the chat and offers to switch to a local builder when the
platform owns the round; `gamedevpl delegate "<task>"
[--agent codex] [--handoff] [--submit]` is the non-interactive form (exit `1` when the agent or the
ladder fails).
If a local agent fails, the CLI keeps the request and its partial edits. Use `/diff` to inspect
them, then `/retry` to run the same request with the same agent; no new Studio turn is sent.

`gamedevpl connect <slug>` opens a work-mode picker in an interactive terminal.
It detects a matching checkout in the current directory or its `<slug>` child.
When found, the local choices reuse its files, including unsent changes; selecting
an agent remembers it for the next editing request. `/play` then previews locally.
The picker labels MCP choices as using platform sources when no checkout exists.
`--manual` prints the MCP handoff without launching an agent.

Codex MCP runs in its native interactive terminal with workspace-write isolation and
on-request user approvals. Answer network/tool permission requests there, then exit
to return to gamedevpl. It refuses an unattended MCP launch instead of starting a
session that cannot ask for permissions. Native tool policies still apply.
Claude and Copilot keep their existing temporary MCP configuration. Scratch files
remain available after an MCP run; process exit alone does not confirm delivery.
Existing user MCP configuration is not overwritten.

## Releases

Versions come from [`CHANGELOG.md`](./CHANGELOG.md): add a line under `## Unreleased` in
the category that fits, and the `release(cli)` PR that opens on master is the cutoff —
merging it publishes `cli-vX.Y.Z`. Rules, commands and traps:
[`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md).

Adapter invocation references: [Cursor headless](https://docs.cursor.com/en/cli/headless),
[Gemini headless](https://geminicli.com/docs/cli/headless/), and
[Copilot CLI](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
Installed Claude, Codex, agy, Vibe, and Copilot flags were checked against `--help`.

## Play while building

Interactive `gamedevpl play [slug]` opens the browser workbench described below.
The raw-preview path is available with `--preview` (and remains the default without a TTY).

`gamedevpl play --preview` in a checkout opens a local game and reloads it after successful
source changes. The pinned Creator Kit assembles the document; a separate preview
process keeps watching while your agent edits or after its command exits. Interactive local
CLI delegation starts this preview automatically and prints its URL.

Raw preview opens at the port's `/`, without a secret path in the browser URL.
Codespaces can forward the port and complete GitHub sign-in without restoring a token.
The server accepts loopback hosts and the current Codespaces forwarded hostname;
other tunnels need their exact host in `GAMEDEVPL_PREVIEW_ALLOWED_HOSTS` (comma-separated,
including the port when the browser URL has one). This is a development server:
keep forwarded ports private. Cross-origin requests are refused, and stop/retry
require a matching HTTP Origin. Older token-path sessions remain discoverable
and are restarted when opening raw preview with the new CLI.
Changing the effective allowed hosts restarts a reused preview automatically.

- `gamedevpl play --preview [slug]` reuses the running preview for the matching checkout.
- `--no-open` prints the URL without launching a browser.
- `gamedevpl play --list` lists running workbenches and previews, with session IDs,
  game names, directories and URLs. Ordinary `play` also shows already-running sessions.
- `gamedevpl play --stop` (or `gamedevpl stop`) stops sessions for the current checkout.
  `--stop <slug>` selects a game; multiple checkout copies require a session ID.
- `gamedevpl play --stop --session <id>` stops exactly the selected workbench or preview
  from any directory. `--stop --all` stops all local Play sessions for your OS user.
  These flags also work with `gamedevpl stop`, `/stop` and `/play --stop`.
- Older previews remain discoverable by ID even when their records lack game/directory
  metadata. Their current checkout can still identify them for a default stop.
- Stale, unreachable and unsafe records are excluded. Discovery checks only registered
  loopback servers; stop uses their authenticated HTTP endpoint. It never kills an
  unrelated process from an old PID or scans browser tabs.
- `/play` opens the active
  game in the REPL without sending a build request. Mixed editing requests still
  go through the ordinary conversation.
- Outside a matching checkout, `play --preview <slug>` opens the remote `/play/<slug>` page.
  The browser uses its existing gamedev.pl sign-in; no token goes into the link.
- Compilation errors appear above the last successful game. Fixing the source
  resumes reload automatically. “Pause reload” holds the current game until resumed.
- Reload restarts the game; arbitrary runtime state is not migrated. The server
  binds to loopback, keeps the iframe sandbox, and exits after 30 minutes without
  browser activity. It does not submit, publish, or expose a public preview.

Agents in downloaded checkouts receive `AGENTS.md` instructions for `play`.
MCP/managed agents point to the existing round card or remote play link, without
creating another round. A local CLI or browser opens the page on the creator's machine.
The anonymous `play_requested` CLI event counts opens without game names or paths.

Unattended `delegate` does not start a preview server. Preview startup honors
cancellation, including waits for another process to finish setup.

Natural-language requests go through the server-side assistant, including inside a checkout.
It uses the active game and conversation context to choose play, status, editing or a new
game, and asks for clarification when needed. `/play` remains a direct shortcut.

While a command runs, the TUI replaces the editor with an animated activity panel,
current step and elapsed time. Background round updates stay separate from foreground
work. Ctrl+C interrupts an active agent or exits when no cancellable agent is running.
The editor returns when work completes; arrow keys recall prompts or navigate choices.

The prompt and the follow-up composer use the usual terminal editing keys:

| Keys                                                                            | Action                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Option/Alt+← →, Ctrl+← →                                                        | Move by word                                                         |
| Ctrl+A / Ctrl+E, Home / End                                                     | Start / end of the line                                              |
| Option+Backspace, Ctrl+W                                                        | Delete the previous word                                             |
| Option+D, Fn+Delete                                                             | Delete the next word / character                                     |
| Ctrl+U / Ctrl+K                                                                 | Delete to the start / end of the line                                |
| Ctrl+Y                                                                          | Paste the last deleted text                                          |
| Ctrl+_                                                                          | Undo                                                                 |
| Option+Enter, Shift+Enter (where the terminal sends it), Ctrl+J, `\` then Enter | New line                                                             |
| ↑ ↓                                                                             | Move between draft lines, then through history                       |
| Ctrl+R                                                                          | Search sent prompts; Enter or Tab accepts, Esc cancels               |
| Ctrl+C                                                                          | Clear the draft; on an empty draft, cancel or stop the running agent |

Pasted text keeps its line breaks and is never sent until you press Enter. On macOS, Option sends these keys
when the terminal treats it as Meta/Esc+ (Terminal.app: "Use Option as Meta key"; iTerm2: Option as Esc+), or
natively in terminals that report modified arrows.

### Terminal workspace sidebar

In a checkout at 120 columns and 16 rows or larger, `gamedevpl --terminal` runs full screen on the terminal's
alternate screen, so the wheel scrolls the conversation rather than the terminal's history. The workspace sidebar
is hidden by default; **Ctrl+B** (or `GAMEDEV_SIDEBAR=1`) toggles it without leaving full screen. The right sidebar
shows the current task, queued follow-ups, preview availability, Studio round updates, and local game file
modifications. Smaller terminals and sessions outside a checkout stream into terminal history.

Set `GAMEDEV_TUI=inline` to keep conversation output in terminal history with native selection, scrollback and
terminal search; Ctrl+B then opens the full-screen workspace with the sidebar, and closing it returns to the normal
terminal and adds the conversation that arrived meanwhile to its history, so no workspace frames end up in scrollback.

Full screen, the wheel or trackpad scrolls the conversation under the pointer, and PgUp/PgDn scroll the chat
(or active choice question). Drag to select text; the selection is copied when you release the button
(double-click selects a word, triple-click a line). A selection stays inside the column it started in, and dragging
past the top or bottom edge scrolls the conversation. Copying uses `pbcopy` on a local macOS terminal and OSC 52
everywhere else, which also works over SSH and inside tmux (`set -g set-clipboard on`). Escape or a click clears
the selection. Hold Option (iTerm2), Fn (Terminal.app) or Shift (most other terminals) to use the terminal's own
selection instead, or set `GAMEDEV_DISABLE_MOUSE=1` to keep mouse capture off in the workspace. Existing `/diff`,
Ctrl+D and `/logs` keep their scrollable detail views.

Changes are compared with `.gamedev-base.json`, not Git, using the same game-file
reader and ignore rules as submission. Shared Kit files stay out of the list. The
visible sidebar refreshes local files every three seconds and makes no additional
API requests. Without a checkout baseline it says so instead of guessing. `/status`
and `/diff` still fetch the current platform comparison and identify conflicts;
this sidebar is a local summary, not a delivery or verification verdict.

Narrow or short terminals use the existing single-column view and native scrollback.
Widening restores the split and session messages. Native vendor permission handoffs
resume after the handoff's transcript position, preserving input ownership and avoiding
replayed output. Sidebar visibility lasts for the current terminal mount.

### Claude authentication and local sessions

Claude delegation requires Claude.ai subscription authentication. The CLI removes inherited
Anthropic credentials, authentication headers and provider-routing environment settings only from the child process and checks
`claude auth status --json` in the task directory before launching. An API login, a
settings-level API override, or an unverifiable login stops the task instead of falling
back to API billing. Both Claude.ai login and `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`
are accepted. Older versions without `auth status` require a Claude Code update.
The check is asynchronous and cancellable; local preparation and delegation telemetry wait
for it. Its result is reused for that launch, then checked afresh for the next task so
account or settings changes cannot reuse a stale approval. Model-selection settings remain intact.
Your parent shell and stored credentials are not modified. Subscription limits and any
extra-usage settings remain controlled by Claude; this check is not a promise of unlimited usage.

These are local `claude -p` tasks, not sessions created in Claude Desktop. When Claude
emits its session ID, the CLI shows it with a resume command. Resume only after the
current task finishes. The task panel names the active agent and reports tool activity;
the CLI runs the checkout validation after the agent exits and retains error details.

### Creator Kit updates

Opening a game checkout in the TUI checks the currently published Creator Kit and
asks whether to update now or later. `/kit` repeats the check and offer. In a shell,
`gamedevpl kit` checks and `gamedevpl kit update` explicitly installs the update.
`gamedevpl play` reports available updates without prompting; an offline update
check does not prevent local play.

The update downloads the Kit and installs its pinned dependencies in a private
staging directory under `.gamedev/`. Only after setup succeeds does the CLI replace
Kit-owned paths, dependencies and the pin. Game sources, Git history and custom
workflows stay in place. New Kit paths that would overwrite unowned files are
refused. Existing local changes inside Kit-owned tools are replaced, as with
`setup.mjs`; keep game edits under `games/<slug>/`.

Failed preparation leaves the installed Kit intact. A failed swap rolls back; an
interrupted swap is recovered on the next `gamedevpl kit update` (also available
through `/kit`). Other local preparation refuses to use a pending installation.
Updates stop the old preview; `/play` starts it with the new tools. An updated Kit
is not a passing game validation or a delivery: the regular play/build/submit checks
still run on your game. No sources are pulled or published by a Kit update.

### Open an existing game

A source repository with a pinned `gamedev-kit.json` and a `slug` in the
frontmatter of `src/SPEC.md` is recognized directly. Run `gamedevpl connect`
from its root, a source subdirectory or `.gamedev/local/`; `connect <slug>` also reuses this repository
in preference to a nested checkout. Agents, Code, diff, pull and push use `src/`;
Git history, remotes, scripts and documentation stay in the repository. No
workspace download or second checkout is needed.

To use a standard workspace instead, choose **Create a standard checkout** in
Connect. The destination picker offers a new directory or the current directory
(`.`), and shows the resolved path. A fresh checkout always requires an empty
destination, even when it contains a recognized game. For another path, run
`gamedevpl checkout airtime ../airtime-standard` or `/checkout airtime <directory>`.
`gamedevpl checkout airtime .` and `/checkout airtime .` download into the current
directory. Plain `/checkout` continues to reuse the current game's checkout.

Local play and verification run the repository's `npm run setup` to prepare the
pinned Kit in `.gamedev/local/`. The CLI mirrors current game sources into that
build directory, including deletions; edit `src/`, not the generated runtime.
PNG/WebP assets remain binary files in `src/` and the runtime; delivery uses base64.
Kit changes remain controlled by `gamedev-kit.json` and the repository's setup.
If the first connection finds local differences without `.gamedev-base.json`,
local editing is available, but delivery and pull still require reconciliation.
Review `gamedevpl diff`: `push --force` explicitly delivers your local sources;
`pull --force` explicitly replaces them with platform sources. Neither happens
automatically on connect. Recovery under a different slug requires a separate
repository copy with its spec and setup scripts updated.
Once opened, a source repository keeps its game identity in local metadata and
its base record. Editing the SPEC slug cannot retarget that checkout to another
game; restore its original slug or start from a fresh repository copy.

Run `gamedevpl connect <slug>` in a terminal to enter an interactive session. Choose
**Open a local checkout** to download the game (or reuse its checkout in the current
directory), **Continue chatting** to work without local files, or an installed MCP
agent to start that agent. The session stays open after the agent finishes.

`gamedevpl repl <slug>` opens the same guided session. Inside it, `/checkout` uses
the current game and switches subsequent edits, `/play` and `/submit` to its local
files. Games without a delivery can be checked out too: they start with the brief,
so an agent must build the game before it can be played.

`gamedevpl checkout <slug> [directory]` downloads files from the shell and prints
how to enter the local interactive session. It refuses non-empty destinations;
`/checkout` can reuse an existing checkout of the same game without overwriting it.

For manual MCP configuration use `gamedevpl connect <slug> --manual`. Redirected
output also retains the manual setup behavior. `--agent <name>` explicitly starts
an MCP agent. Automated agent launches do not print the manual credential snippet.

If the game is only an idea and has not been created yet, run `gamedevpl` without
arguments and describe it. `connect <slug>` opens an existing owned game; clicking
Create in Studio establishes its submission even before an agent starts or delivers
files. A missing game is not silently created by connect.

In the interactive prompt, type `/` to browse commands or `/pu` to find `/pull`. Use ↑/↓ to select, Tab to fill, and Enter to send. Enter on a partial command fills it first. Esc hides suggestions and keeps your text; outside the suggestion list, ↑/↓ browses history. Suggestions run locally and make no model requests.

### Delegated model and reasoning effort

Use `/model` in the interactive session to choose an agent, model and reasoning
effort. Choices are saved per agent for future local and MCP delegations. Codex
choices come from its local model cache when available; other model IDs can be
entered directly. A model still needs to be available to your agent's account.

You can also configure this from a terminal:

```sh
gamedevpl model codex --model YOUR_MODEL_ID --effort high
gamedevpl model muse --model YOUR_MODEL_ID --effort medium
gamedevpl model codex --reset
```

Without overrides, the agent keeps its own configuration. The task header says
“tool default (not reported)” rather than guessing its effective model or effort.
Vibe model selection uses `VIBE_ACTIVE_MODEL`; tools without an effort override
keep their own reasoning settings. Unsupported installed CLI flags fail preflight.

The main local-task view groups progress and abbreviates shell operations. `/logs`
shows the full sanitized transcript of the latest task in the current interactive
checkout. Logs are private local temporary files; one-shot delegation prints the
log path. Logs are not sent to gamedev.pl and may contain local source text.

When Antigravity cannot ask for a permission in headless mode, the interactive CLI offers to hand it the terminal and resume that conversation. Answer permissions in Antigravity, then exit it to return to CLI verification. Sandbox settings stay enabled; permissions are not automatically approved. One-shot/unattended runs do not open an interactive session. On macOS and Linux, native interactive output is recorded in `/logs` using the system terminal recorder. On Windows it remains in terminal scrollback. Studio shows local task activity separately from delivery status; game files are sent only by submission.

### Recover an open agent session

If a previous MCP agent stopped without ending its session, preview delivery can remain locked. The interactive delivery prompt offers to disconnect that session and deliver the local checkout. For an explicit retry, use `/submit --takeover` or `gamedevpl submit --takeover [dir]`. This revokes the previous session key and sends the full local file snapshot after checks pass. It does not stop the local agent process, so stop that process first if it is still editing your checkout. Old server staging stays in the previous generation; it is not mixed into your local delivery. Managed agents and pending handoffs must finish through Studio. `--force` alone never takes over an agent session.

### Push local changes

Use `/push` in the checkout session, or `gamedevpl push [dir]`, to run checks and deliver a preview. `/pull` brings platform changes into the checkout. `/submit` remains an alias for `/push`; neither publishes publicly unless you explicitly pass `--publish`.

Use `gamedevpl publish [dir]` in your shell or `/publish [dir]` in the checkout session as a shortcut for `push [dir] --publish`. Both run the full local checks and submit a publication candidate; an operator still approves public publication. Flags such as `--takeover` and `--force` work as with `push`.

Local tasks default to **Auto (sandboxed)** for agents with supported sandbox flags.
Other agents default to Ask. `/permissions ask` selects prompts explicitly; choosing
Auto explicitly for an unsupported agent reports an error. Sandbox startup failures
stop the task.

Claude permission prompts also offer **Resume this task in Auto (sandboxed)**.
This resumes the same conversation with a sandbox and keeps local edits; later tasks
in this CLI session use Auto too. To select it before starting a task, use
`/permissions auto` or `gamedevpl --permissions auto`. A sandbox escape is denied.

An updated CLI restarts raw previews from older versions. For an existing browser
workspace, it tells you to finish active work and run `gamedevpl stop`, then
`gamedevpl play`, so an agent is not interrupted by an update.

### Antigravity permissions

Before a local Antigravity task starts, the interactive CLI offers to enable
sandboxed headless execution. Confirming sets `enableTerminalSandbox: true` and
`toolPermission: "proceed-in-sandbox"` in
`~/.gemini/antigravity-cli/settings.json`. This is an **agy-wide setting**, shared
by all projects. Existing permission rules and other preferences are preserved;
the previous file is backed up beside it, with the backup path printed after setup.

Agy runs approved sandboxed commands without opening another terminal UI. Existing
ask/deny rules still apply, as do any outside-sandbox exceptions you previously
configured. The CLI does not add wildcard grants or `--dangerously-skip-permissions`.
If agy still needs permission, you can resume the task interactively or return with
local edits preserved. Network access and tools outside the sandbox may still need
approval; enabling this preset does not grant unrestricted access.

The enabled preset is detected on subsequent runs. To change it later, use agy's
`/config` or restore the printed backup. You can also choose existing permissions
for one run or cancel before preparation starts. Unattended CLI runs never modify
agy settings or open a permission picker.

See the [Antigravity sandbox documentation](https://antigravity.google/docs/cli/sandbox/).

### Muse waiting for approval

Local Muse tasks can request permission without emitting the request on headless
stdout. The CLI follows only the active session's journal under Muse's data
home (`XDG_DATA_HOME`, or `~/.local/share`). When approval is pending, it stops
that headless process and offers to resume the same session in interactive Muse.
Answer or continue there, then exit to let the CLI verify the local checkout.
No command is automatically approved, and choosing to return preserves local edits.
Unattended runs stop and print the exact `muse resume <session-id>` command instead
of opening a picker or delivering unverified work. Session logging must remain enabled.

### Recover local sources

If an admin canceled a round, or the game record was deleted, run:

```sh
gamedevpl recover ./my-game
# Inspect the result, then confirm:
gamedevpl recover ./my-game --yes
```

Recovery creates a self-build draft and stages the local sources. It does not start
an agent, run a build or publish. Run `gamedevpl push` in the recovered checkout to
validate and deliver a preview. Existing local files are preserved.

If the slug belongs to another game, choose an unused name:

```sh
gamedevpl recover ./my-game --slug my-recovered-game --yes
```

The renamed copy is created beside the original as `my-recovered-game-recovered`.
The original checkout is kept. Interrupted staging can be retried with the same
command; `.gamedev-recovery.json` retains the recovery key until completion.
Recovery uses the normal creation moderation and quota rules. It cannot restore
server history that was permanently deleted.

### Returning to a deleted or canceled game

Run `gamedevpl` inside its local checkout, or `gamedevpl connect <slug>` inside
that checkout or its parent directory. If the game is missing or its round was
canceled or archived, the CLI offers **Recover and continue**. Confirm once to
stage your existing sources and continue editing in the same session. Local
edits are preserved; recovery does not publish the game. Use `/push` when ready.

Canceling keeps the session attached to those local files. Use `/recover` to
try again or `/connect` to retry connecting. Authentication and network failures
do not trigger recovery. Explicit `gamedevpl recover <directory>` remains
available for scripts and recovery under another slug.

### Local browser tools for delegated tasks

Interactive local delegation to Codex, Claude, and Copilot automatically connects a
session-scoped `gamedevpl_local` MCP server when the CLI preview is available.
`preview_status` reports build errors and freshness. `capture_game` starts a desktop or
mobile screenshot; `capture_status` returns its PNG, rendered HTML revision, and
browser console errors. Agents can inspect the returned image without launching a
browser through their shell sandbox. Other adapters continue without these tools.

The connection message lists the tools actually exposed to the agent. For screenshots,
agents use `capture_game({ viewport: "desktop" })` (or `"mobile"`) and poll
`capture_status({ jobId })` until complete or failed. The CLI host starts the capture
server, so the agent does not need to run `npm run capture` or request sandbox
escalation when shell commands fail with `listen EPERM`. The former `capture` name
remains callable for compatibility.

The creator's CLI launches an installed system Chrome/Chromium (Chrome/Edge on Windows)
with a temporary profile and its browser sandbox enabled. It does not install a browser.
Capture uses CLI-owned code and a frozen preview document, not checkout npm scripts.
The game stays in an iframe without `allow-same-origin`, with external connections
blocked by CSP. Screenshot tools accept no URL, shell command, path, or JavaScript.
They neither publish nor replace game media. This initial-state capture does not
replace an interactive playtest or the Creator Kit's deterministic capture plan.

The loopback MCP endpoint requires a random per-task credential, rejects foreign
origins/hosts, limits requests and retained captures, and shuts down with the task.
The agent's shell permissions are unchanged. Credentials/configuration are temporary;
the normal remote gamedev.pl MCP connector is not changed. Ctrl+C cancels local capture.
Existing previews from older CLI versions may need `/play --stop` followed by `/play`.

### Editing beside a local preview

In an interactive CLI session, `/play` opens the game with an **Edit game** overlay.
You can send prompts, queue follow-ups, answer choices, read recent output and request
Stop from the browser. Keep the terminal open; native agent permission handoffs still
use it. Compatible game updates can preserve state; unsupported updates require an
explicit restart. `gamedevpl play --preview` retains the raw preview; interactive
`gamedevpl play` keeps its browser workbench attached to the terminal; Ctrl+C ends
Play and cancels local work. Use `gamedevpl play --detach` to run it in the background.
Bare `gamedevpl` and browser creation use the same default. Closing all tabs ends a
detached session after 60 seconds once active work finishes. Reopening an existing
session preserves its original lifetime. The panel is local to this computer.

### Local progress and diagnostics

Technical tool activity updates one status line instead of filling the conversation.
Replies, questions, errors, and blockers remain visible. Press Ctrl+L to view the
live diagnostic tail while the agent works, or type /logs and Enter during a task.
Arrow keys scroll and pause the tail; return to the bottom to follow updates.
Esc closes diagnostics without interrupting the task. The private temporary log
includes protocol events (bounded per event). In the TUI, /logs after the task
opens the same diagnostic view without copying it into conversation history.

Codex, Claude, and Copilot receive the authenticated local report_progress MCP
tool independently of preview availability. Reports update a single task status;
blocked reports also enter the conversation. They do not mark checks or delivery
as completed. Other adapters, including Muse, use activity inferred from their
events and their normal progress messages; automatic MCP wiring for them is not
implemented. Task diagnostics and progress text stay local, outside telemetry.

### Browser-first creation and editing

In an interactive terminal, run `gamedevpl` for Open/Create, `gamedevpl create "Your game idea"`
for intake, or `gamedevpl play [slug]` for a game. Use `--terminal` for terminal chat
and `play --preview` for raw preview. Non-TTY browser launches use explicit
`create --play` or `play --edit`; JSON and stop retain their previous behavior.
Keep the terminal open; Ctrl+C ends the session and cancels active local work.
The terminal shows live agent activity, progress, errors and task endings.
Tool activity is limited to one update per ten seconds; messages, errors, questions
and check stages appear immediately. Answer questions in Play.
With `--detach`, this output goes to the private local file shown
as `Play log: <path>`; use `tail -f "<path>"` to follow it. Reopening a detached session
prints its log path again. Logs remain in temporary storage after shutdown and may
contain prompts or local source text; `/logs` still opens the detailed task transcript.
Use `--detach` to run independently of the terminal. Use Commands, Attachments and Devices for
CLI/platform operations, local attachments, screenshots,
recording, diagnostic traces and phone pairing on trusted Wi-Fi. Compatible game
updates can preserve state; unsupported updates require an explicit restart.

See [Play workbench](../../docs/play-workbench.md) for access boundaries, adapter
limitations, recovery and verification details. `--no-open` prints the session link.

### GameKit in local projects

New Creator Kits install the pinned engine, types, assets, starters and tools as
`node_modules/@gamedevpl/gamekit`. The project keeps its sources under `games/`;
its npm scripts invoke the package's build commands. The dependency comes from
the verified Kit archive in `.gamedev/gamekit.tgz`, with an exact npm lockfile.
`gamedevpl kit update` stages installation before replacing manifest-owned paths,
including legacy `shared/`, `tools/` and `starters/` folders. Game sources and
local session state remain in place. Older pinned Kits keep working with their
original layout.

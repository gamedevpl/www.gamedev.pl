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
Releases tagged `cli-v*` (one `gamedevpl` asset). `gamedevpl update` uses the same channel.

The REPL talks to `POST /api/cli/chat` on the API. Model keys stay on the server. A game
starts only when that chat decides you asked for one.

Until a release exists, from the repo root after a pull:

```bash
npm install
npm run bundle -w @gamedevpl/cli
node apps/cli/dist/gamedevpl.mjs help
```

`ink` is a workspace dependency. Skipping `npm install` makes esbuild fail with `Could not resolve "ink"`. The bundled script inlines Ink. `gamedevpl` with no verb is that TUI.

## Verbs

`login` `logout` `whoami` `agents` `games` `status` `share` `profile` `handle` `builder`
`connect` `delegate` `checkout` `pull` `diff` `submit` `quota` `notifications` `update` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

`gamedevpl login` opens a browser (loopback OAuth + PKCE). Approve once; the token
stays on this machine. No paste. CI still uses `GAMEDEV_TOKEN` from secrets.
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
and `copilot`. Automatic MCP configuration is available for `claude`, `codex`, and
`copilot`; the others use local files. Cursor runs `cursor-agent`, or `agent` only
after its help identifies it as Cursor. The `cursor` editor launcher is listed
separately and is never treated as a headless agent.
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
`verify_failed` and `delivered` cover the local result. They use the existing visit
endpoint and a process-local random visit ID, with closed adapter/stage dimensions.
No credentials, inventory, executable paths, game identifiers, or prompts are sent.
The existing CLI funnel rollup measures offered-to-used conversion by adapter.
Telemetry failures never block the task.

## Working copy

`gamedevpl checkout <slug>` writes `.gamedev-slug` and `.gamedev-base.json` (the platform
version the copy was taken from). `diff`, `pull`, and `submit` share that three-way
model:

- **local-only** — your edits; `submit` delivers them. `pull` will not overwrite them.
- **platform-only** — the site moved; `pull` is safe.
- **both** — different files; `pull` keeps yours and takes theirs.
- **conflict** — the same path changed on both sides. Copy those files aside, then `pull`.
  `--force` is the explicit overwrite.

A checkout without `.gamedev-base.json` is **legacy**: matching trees are adopted; anything
else is refused so pull cannot guess.

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

## In a checkout

`gamedevpl` started inside a checkout (any subdirectory) opens that game. It shows the
sync state, available local adapters, and who builds.
If a local agent is found and the platform still builds, it asks once whether to hand the
round to your machine (`/builder self`); `/builder platform` hands it back.

With builder `self`, a plain message goes to the Studio chat first — questions get
answers; a change request runs the local agent in `games/<slug>` with a brief, then the
static ladder, then offers to deliver. The agent never sees the OAuth grant. Ctrl+C stops
the agent, not the session. `/delegate <task>` skips the chat; `gamedevpl delegate "<task>"
[--agent codex] [--handoff] [--submit]` is the non-interactive form (exit `1` when the agent or the
ladder fails).

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

`gamedevpl play` in a checkout opens a local game and reloads it after successful
source changes. The pinned Creator Kit assembles the document; a separate preview
process keeps watching while your agent edits or after its command exits. Interactive local
CLI delegation starts this preview automatically and prints its URL.

- `gamedevpl play [slug]` reuses the running preview for the matching checkout.
- `--no-open` prints the URL without launching a browser; `--stop` stops it.
- `/play` opens the active
  game in the REPL without sending a build request. Mixed editing requests still
  go through the ordinary conversation.
- Outside a matching checkout, `play <slug>` opens the remote `/play/<slug>` page.
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

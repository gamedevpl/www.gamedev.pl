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

`gamedevpl connect <slug>` prints the MCP handoff (URL, kickoff, install snippet).
`--agent claude` (or `codex` / `copilot`) launches the agent with temporary MCP configuration,
never the creator OAuth grant or a PAT. The round must use builder `self`; explicit
`--handoff` requests a switch and refuses execution while the switch is pending.
In a matching checkout the agent works on that game's directory; review local changes
before `gamedevpl submit`. Otherwise it uses a scratch directory and the MCP workflow;
the CLI prints the directory and keeps any scratch files after exit. Check the delivery
in Studio. Existing user MCP configuration is not overwritten.
MCP progress appears while the agent runs; Ctrl+C in the REPL stops its process group.

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

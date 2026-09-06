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

`login` `logout` `whoami` `games` `status` `share` `profile` `handle` `builder`
`connect` `delegate` `checkout` `pull` `diff` `submit` `quota` `notifications` `update` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

`gamedevpl login` opens a browser (loopback OAuth + PKCE). Approve once; the token
stays on this machine. No paste. CI still uses `GAMEDEV_TOKEN` from secrets.
Never pass the creator OAuth token to a sub-agent.
`git push` / `git pull` against a checkout use `git-remote-gamedevpl` (same script).

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
sync state, which of `claude` / `codex` / `gemini` / `vibe` are on PATH, and who builds.
If a local agent is found and the platform still builds, it asks once whether to hand the
round to your machine (`/builder self`); `/builder platform` hands it back.

With builder `self`, a plain message goes to the Studio chat first — questions get
answers; a change request runs the local agent in `games/<slug>` with a brief, then the
static ladder, then offers to deliver. The agent never sees the OAuth grant. Ctrl+C stops
the agent, not the session. `/delegate <task>` skips the chat; `gamedevpl delegate "<task>"
[--agent codex] [--submit]` is the non-interactive form (exit `1` when the agent or the
ladder fails).

`gamedevpl connect <slug>` prints the MCP handoff (URL, kickoff, install snippet).
`--agent claude` (or `codex` / `gemini` / `vibe`) spawns that vendor CLI with a
round-scoped token only — never the OAuth grant or a PAT. After the adapter exits,
`gamedevpl submit` is still the delivery command.

## Releases

Versions come from [`CHANGELOG.md`](./CHANGELOG.md): add a line under `## Unreleased` in
the category that fits, and the `release(cli)` PR that opens on master is the cutoff —
merging it publishes `cli-vX.Y.Z`. Rules, commands and traps:
[`.claude/skills/cli-release/SKILL.md`](../../.claude/skills/cli-release/SKILL.md).

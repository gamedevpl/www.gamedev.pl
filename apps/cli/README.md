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

Until a release exists, from the repo root after a pull:

```bash
npm install
npm run bundle -w @gamedevpl/cli
node apps/cli/dist/gamedevpl.mjs help
```

`ink` is a workspace dependency. Skipping `npm install` makes esbuild fail with `Could not resolve "ink"`. The bundled script inlines Ink. `gamedevpl` with no verb is that TUI.

## Verbs

`login` `logout` `whoami` `games` `status` `share` `profile` `handle` `builder`
`connect` `checkout` `pull` `diff` `submit` `quota` `notifications` `update` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

`gamedevpl login` opens a browser (loopback OAuth + PKCE). Approve once; the token
stays on this machine. No paste. CI still uses `GAMEDEV_TOKEN` from secrets.
Never pass the creator OAuth token to a sub-agent.
`git push` / `git pull` against a checkout use `git-remote-gamedevpl` (same script).

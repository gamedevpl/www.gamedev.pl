# gamedev CLI (apps/cli)

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
Releases tagged `cli-v*` (one `gamedev` asset). `gamedev update` uses the same channel.

Until a release exists: `npm run bundle -w @gamedevpl/cli` and run `apps/cli/dist/gamedev.mjs`.

## Verbs

`login` `logout` `whoami` `games` `status` `share` `profile` `handle` `builder`
`connect` `checkout` `pull` `diff` `submit` `quota` `notifications` `update` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

CI: `GAMEDEV_TOKEN` from secrets. Never pass the creator OAuth token to a sub-agent.
`git push` / `git pull` against a checkout use `git-remote-gamedev` (same script).

# gamedev CLI (apps/cli)

Terminal front door for gamedev.pl. **No local model.** Coding happens by delegating to a
vendor CLI the creator already has, or by the platform builder.

This package lives in the public app monorepo until the owner creates
`gamedevpl/gamedev-cli` (stop-and-ask). Extracting it should be a rename, not a rewrite.

## Install (once Wave F ships)

```bash
curl -fsSL https://www.gamedev.pl/install.sh | bash
```

Until then: `npm run build -w @gamedevpl/cli` and run `node apps/cli/dist/main.js`.

## Verbs

`login` `logout` `whoami` `games` `status` `share` `profile` `handle` `builder`
`connect` `checkout` `pull` `diff` `submit` `quota` `notifications` `help`

Exit codes: `0` gate green · `1` gate red · `2` refused · `3` auth · `4` input required.

CI: `GAMEDEV_TOKEN` from secrets. Never pass the creator OAuth token to a sub-agent.

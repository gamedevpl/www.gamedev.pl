# Gamedev.pl for Antigravity — prototype

Create and improve browser games on gamedev.pl from Antigravity. This package connects
the existing remote MCP server and includes the gamedevpl workflow skill.

Version 0.1.0 is a local-install prototype, not a Marketplace listing. It uses a
creator key; OAuth has not been configured or verified for Antigravity.

## Install

Requires Antigravity with the `agy plugin` commands and an approved gamedev.pl
creator account. Request access at <https://www.gamedev.pl> if needed.

From the repository root:

```sh
agy plugin validate --strict ./listings/mcp/antigravity-plugin
agy plugin install ./listings/mcp/antigravity-plugin
agy plugin list --json
```

If using the ZIP, extract it and run those commands with `./antigravity-plugin` instead.
The plugin root is this directory, not the whole gamedev.pl repository.

Open Customizations → Installed → Gamedev.pl and enable it. In the setup dialog,
enter `GAMEDEV_CREATOR_KEY`:

1. Sign in to gamedev.pl and open account settings.
2. Find **Coding-agent key** and create a key if none is active.
3. The site's **Copy header** action copies an authorization header. Paste only
   its key value into Antigravity, removing `Authorization:` and `Bearer` if present.
   The plugin adds `Bearer` automatically.

Keep the real key in Antigravity's credential setup, never in these files or chat.
This is an account-wide creator key; revoking or rotating it disconnects agents using it.
A Studio round key or a personal site-access token is not a replacement.

## Verify the connection first

Ask Antigravity:

> List my games on gamedev.pl without creating a game or opening a build round.

Expected: a real `list_account_games` MCP call and your game list (an empty list
also counts). Seeing the plugin installed alone does not prove tools work.
Record the Antigravity version, tool name and result without credentials.
This check requires no `start` call or build credits.

Then invoke `/gamedevpl` with your game idea and request a **preview**.
A new game uses `create_game`; an existing one uses its slug and the appropriate
round-opening flow. These actions can spend your account's build allowance.
The server returns the current tool schemas and round sequence; the bundled skill
explains how to read existing sources, stage edits, submit and close the session.
A preview is not public publication. Ask explicitly to publish when ready.

## Troubleshooting

- **Installed but disabled:** enable the plugin and complete its credential dialog.
- **No tools:** check the plugin detail's MCP tab; it must discover `gamedevpl`
  from `mcp_config.json`. Restart the session after configuring credentials.
- **Unauthorized:** check the key value and whether it expired, was revoked or rotated.
  Do not pass a whole copied header into the key field.
- **Creator access refused:** the account must be approved; retrying does not grant access.
- **No active round:** list games first and follow the skill's draft/published flow.
  Do not create a replacement game just to test authentication.
- **Network denied:** the client must be able to reach `www.gamedev.pl` over HTTPS.

## Validation status

The endpoint and creator-key Bearer contract come from this repository's existing
MCP manifests and implementation. The skill is copied unchanged from the existing
Claude plugin so its round guidance stays consistent.

Antigravity CLI validation, credential-dialog behavior, MCP discovery and a real
account read must be checked in Antigravity before calling this integration verified.
No credentials, production games or rounds are included in the package.

## Maintenance

When the canonical `listings/mcp/claude-plugin/skills/gamedevpl/SKILL.md` changes,
copy it here too and bump this plugin's version. Keep the endpoint aligned with
`listings/mcp/official-registry/server.json`.

Authoring reference: <https://antigravity.google/docs/build-plugins/>

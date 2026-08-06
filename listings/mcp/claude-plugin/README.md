# gamedev.pl — Claude plugin

The plugin body for the marketplace declared at
[`.claude-plugin/marketplace.json`](../../../.claude-plugin/marketplace.json) in the repo
root. Install it with:

```
/plugin marketplace add gamedevpl/www.gamedev.pl
/plugin install gamedev-pl@gamedev-pl
```

or from claude.ai: **Settings → Plugins → Add → Add marketplace**, then
`gamedevpl/www.gamedev.pl`.

## Why this lives in its own directory

The plugin's `source` deliberately points here rather than at the repository root. Claude
discovers plugin components (`skills/`, `commands/`, `agents/`, hooks) from the plugin
root, and this repository's `.claude/` directory holds internal tooling that is not part
of any published plugin — including a skill describing the private ops repo. Rooting the
plugin at a directory that contains only its own manifest means component discovery can
only ever find what we put here on purpose.

The MCP server itself is declared inline in the marketplace entry, so there is exactly one
place the endpoint URL appears for this ecosystem, and `cursor-plugin-manifest.test.ts`
asserts it matches the registry entry.

## What it does

Connects Claude to the gamedev.pl remote MCP server so a creator can open a build round,
read the brief and starter kit, stage and submit game sources, poll the quality gate, and
exchange messages — from Claude instead of the web editor.

Creating games is in closed beta. The server says so on connect and in its 401 response;
anyone can install it and list its tools, but writes need an approved creator account.

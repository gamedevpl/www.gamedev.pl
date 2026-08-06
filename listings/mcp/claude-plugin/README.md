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

## Where the MCP server is declared, and why in two places

[`.mcp.json`](./.mcp.json) in this directory is the one that matters: the documented
locations for a plugin's MCP config are **`.mcp.json` in the plugin root, or inline in the
plugin's own `plugin.json`** — _not_ the marketplace entry. The first cut declared it only
in the marketplace entry, and the plugin installed cleanly while exposing no tools at all,
which is a confusing failure because nothing errors.

`plugin.json` points at that file explicitly (`"mcpServers": "./.mcp.json"`), and the
marketplace entry keeps its inline copy so a loader reading either finds the same server.
`plugin-manifests.test.ts` asserts all of them agree with the published registry entry and
with each other, so none can be updated alone.

## What it does

Connects Claude to the gamedev.pl remote MCP server so a creator can open a build round,
read the brief and starter kit, stage and submit game sources, poll the quality gate, and
exchange messages — from Claude instead of the web editor.

Creating games is in closed beta. The server says so on connect and in its 401 response;
anyone can install it and list its tools, but writes need an approved creator account.

## Versioning

This plugin versions independently of the Cursor plugin and of the MCP server's registry
entry, even though all three started at 1.0.1. Claude uses the plugin version to detect
updates, so a fix that changes what the plugin exposes **must** ship a bump — an installed
copy will otherwise keep serving the cached, broken version on refresh. 1.0.2 is exactly
that case: it added the `.mcp.json` that 1.0.1 was missing.

The registry entry versions the _server_ and is immutable once published, so it moves only
when the server itself changes. `plugin-manifests.test.ts` asserts the plugin's own two
declarations agree, and deliberately does not tie them to the other two lines.

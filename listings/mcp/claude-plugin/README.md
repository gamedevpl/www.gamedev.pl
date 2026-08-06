# gamedev.pl — Claude plugin

Build and improve browser games on [gamedev.pl](https://www.gamedev.pl) from Claude.

The plugin connects Claude to the gamedev.pl remote MCP server, so you can open a build
round, read the brief and starter kit, stage and submit game sources, poll the automated
quality gate, and exchange messages with the creator — without leaving the conversation.
Games run in the browser and publish to a public catalog.

> **Creating games is currently in closed beta.** Anyone can install this plugin and
> inspect its tools, but building needs an approved creator account —
> [join the waitlist](https://www.gamedev.pl). The server says so when it connects, so you
> will not discover it only after trying to build something.

## Install

In Claude Code:

```
/plugin marketplace add gamedevpl/www.gamedev.pl
/plugin install gamedev-pl@gamedev-pl
```

In claude.ai: **Settings → Plugins → Add → Add marketplace**, then
`gamedevpl/www.gamedev.pl`.

**Then approve the `gamedevpl` connector.** Installing the plugin does not connect the
server on its own, and that is deliberate: a plugin comes from a repository rather than
from you, so Claude puts every MCP server a plugin declares behind the same per-server
approval as a project `.mcp.json`. Without that gate, installing a third-party plugin
could silently attach a remote server to your assistant. Two steps, on purpose.

## What you can do with it

- **Start a new game** from a description and have Claude build, submit and iterate on it
  until the quality gate passes.
- **Improve a game you already published**, by opening an improvement round so Claude
  reads the existing sources before changing them.
- **Fix what the gate flagged** — read the verdict, patch the sources, resubmit.

## Links

- Site and waitlist: <https://www.gamedev.pl>
- Creator Studio: <https://www.gamedev.pl/studio>
- Source: <https://github.com/gamedevpl/www.gamedev.pl> (GPL-3.0-only)
- The same server in the official MCP Registry: `pl.gamedev/creator`

---

## Maintainer notes

Not needed to use the plugin; kept here because each point is a decision that cost
something to learn.

**The plugin is rooted here, not at the repository root.** Claude discovers plugin
components (`skills/`, `commands/`, `agents/`, hooks) from the plugin root, and this
repository's `.claude/` directory holds internal tooling that is not part of any published
plugin — including a skill describing the private ops repo. Rooting the plugin at a
directory containing only its own manifest means discovery can only find what we put here
deliberately. `plugin-manifests.test.ts` pins that path.

**The MCP server is declared in [`.mcp.json`](./.mcp.json), and that is the one that
matters.** A plugin's MCP config is read from `.mcp.json` in the plugin root or inline in
its own `plugin.json` — _not_ from the marketplace entry. The first cut declared it only
in the marketplace entry; the plugin installed cleanly and exposed no tools, with nothing
erroring anywhere. `plugin.json` now points at the file explicitly and the marketplace
entry keeps an inline copy, so either read path finds the same server.

**Versioning is independent** of the Cursor plugin and of the MCP server's registry entry,
even though all three started at 1.0.1. Claude uses the plugin version to detect updates,
so a change to what the plugin exposes must ship a bump — otherwise an installed copy
keeps serving the cached version. 1.0.2 was exactly that: it added the `.mcp.json` that
1.0.1 lacked. The registry entry versions the _server_ and is immutable once published.

**Both manifests are validated** with `claude plugin validate listings/mcp/claude-plugin`
and `claude plugin validate .` before submission.

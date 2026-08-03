# Cursor directory / marketplace — draft listing (NOT SUBMITTED)

**Status:** prepared for owner review. Do not publish.

## Sources (DOCUMENTED)

- Cursor MCP overview + remote HTTP config: https://cursor.com/docs/mcp
- One-click install deeplinks: https://cursor.com/docs/mcp/install-links
- Community directory: https://cursor.directory
- Marketplace / plugins path: https://cursor.com/docs/plugins (Cursor Marketplace)

## Proposed listing copy

| Field              | Value                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | gamedev.pl                                                                                                                                  |
| Short description  | Build and improve browser games on gamedev.pl from your coding agent.                                                                       |
| MCP URL            | `https://www.gamedev.pl/api/mcp`                                                                                                            |
| Transport          | Streamable HTTP                                                                                                                             |
| Auth               | OAuth (discover via `/.well-known/oauth-protected-resource`) or creator-supplied `Authorization` header — never embedded in an install link |
| Docs               | https://www.gamedev.pl/studio                                                                                                               |
| Repository         | https://github.com/gamedevpl/www.gamedev.pl                                                                                                 |
| Discovery document | https://www.gamedev.pl/.well-known/mcp/server.json                                                                                          |

## Install link (credential-free)

```
cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=eyJ1cmwiOiJodHRwczovL3d3dy5nYW1lZGV2LnBsL2FwaS9tY3AifQ==
```

Decoded `config`: `{"url":"https://www.gamedev.pl/api/mcp"}` — no headers, no secrets.

## Submission notes (updated 2026-08-03)

- The old official feed repo `github.com/cursor/mcp-servers` was **archived 2026-03-19**;
  its README redirects community submissions to **cursor.directory/plugins/new**.
- Current official path is the **Cursor Marketplace** (https://cursor.com/marketplace):
  publish portal at https://cursor.com/marketplace/publish. Requires an **open-source**
  repo with a `.cursor-plugin/plugin.json` manifest (lowercase kebab-case name,
  displayName, author, description, keywords, license, version; template:
  https://github.com/cursor/plugin-template). **Manual review by the Cursor team on
  initial submission and on every update**; no published SLA, no fee.
- Community tier: https://cursor.directory/plugins/new (self-serve, light review).
- The deep link needs no approval at all and can be placed on our own pages today.
- Deep-link click behaviour on Cursor desktop: **unknown** in this environment (no GUI
  Cursor install to observe). Format is DOCUMENTED only.
- Cursor OAuth redirect allowlist (if static client registration ever replaces DCR):
  `https://www.cursor.com/agents/mcp/oauth/callback` (web/cloud) and
  `http://localhost:8787/callback` (desktop).

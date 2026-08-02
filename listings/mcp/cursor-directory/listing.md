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

## Submission notes

- Cursor directory / marketplace submission UX is product-side; there is no self-serve
  API documented for third-party remote HTTP servers comparable to the official MCP
  Registry publisher. Owner decides the channel (directory vs Marketplace plugin).
- Deep-link click behaviour on Cursor desktop: **unknown** in this environment (no GUI
  Cursor install to observe). Format is DOCUMENTED only.

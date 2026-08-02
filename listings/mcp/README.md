# MCP listing artifacts (BY-18c) — prepared, not submitted

These files are **drafts for the owner to submit later**. Do not publish them to any
registry, directory, or marketplace from this PR. Public listing is gated on terms and
consent work that has not been cleared yet.

D5 still stands: everything here is a listing, a manifest, a URL, or a deep link — never
an npm package we maintain.

## Live discovery (already served by the app)

| Path                                        | What                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/mcp/server.json`          | Registry-shaped `server.json` (schema `2025-12-11`). Auth points at `/.well-known/oauth-protected-resource` rather than restating it. |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 protected-resource metadata (BY-18a).                                                                                        |

SEP-2127 Server Cards (`/.well-known/mcp.json`) remain an experimental working-group draft
as of 2026-08; we intentionally ship the official registry shape instead.

## Artifacts in this folder

| Path                                                                                 | Target                           | Where it would go (when cleared)                                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`official-registry/server.json`](./official-registry/server.json)                   | Official MCP Registry            | Publish via `mcp-publisher` / registry API — see https://modelcontextprotocol.io/registry/remote-servers |
| [`cursor-directory/listing.md`](./cursor-directory/listing.md)                       | Cursor directory / marketplace   | https://cursor.directory and/or Cursor Marketplace (plugins path)                                        |
| [`claude-connectors-directory/listing.md`](./claude-connectors-directory/listing.md) | Claude Connectors Directory      | Portal at https://claude.ai/admin-settings/directory/submissions/new (Team/Enterprise)                   |
| [`chatgpt-apps-connector/listing.md`](./chatgpt-apps-connector/listing.md)           | ChatGPT Apps / plugins connector | OpenAI plugin submission portal — https://developers.openai.com/plugins/deploy/submission                |

## One-click install (product surface, not a listing)

On the Studio connect card, credential-free deep links install the **server URL only**:

- Cursor: `cursor://anysphere.cursor-deeplink/mcp/install?…`
- VS Code: `vscode:mcp/install?…`

A one-click install link must never carry a credential. Auth is OAuth discovery or a
header the creator fills in afterwards. Clients without a credential-free deep-link format
keep the hand-copy config block (Claude Code, Codex, Kimi, CLI).

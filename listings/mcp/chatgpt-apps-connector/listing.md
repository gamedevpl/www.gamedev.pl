# ChatGPT Apps / plugins connector — draft listing (NOT SUBMITTED)

**Status:** prepared for owner review. Do not publish.

## Sources (DOCUMENTED)

- Submit plugins: https://developers.openai.com/plugins/deploy/submission
- MCP server review requirements: https://developers.openai.com/plugins/deploy/app-review
- Apps SDK MCP server guide: https://developers.openai.com/apps-sdk/build/mcp-server

## Proposed submission fields

| Field               | Draft value                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin / app name   | gamedev.pl                                                                                                                                                                                                                                                                                          |
| Short description   | Build and improve browser games on gamedev.pl from ChatGPT.                                                                                                                                                                                                                                         |
| Long description    | gamedev.pl lets creators open a self-build round and drive a sandboxed browser-game pipeline from an MCP-capable agent. This connector exposes the remote Streamable HTTP MCP endpoint. Authentication uses OAuth (RFC 9728 protected-resource discovery) — never a secret embedded in a share URL. |
| MCP server URL type | Universal                                                                                                                                                                                                                                                                                           |
| MCP server URL      | `https://www.gamedev.pl/api/mcp`                                                                                                                                                                                                                                                                    |
| Authentication      | OAuth                                                                                                                                                                                                                                                                                               |
| Website             | https://www.gamedev.pl                                                                                                                                                                                                                                                                              |
| Support URL         | _(owner supplies)_                                                                                                                                                                                                                                                                                  |
| Privacy policy URL  | _(owner supplies — gated)_                                                                                                                                                                                                                                                                          |
| Terms URL           | _(owner supplies — gated)_                                                                                                                                                                                                                                                                          |
| Category            | Developer tools / Games                                                                                                                                                                                                                                                                             |
| Logo                | _(owner supplies)_                                                                                                                                                                                                                                                                                  |

## Domain verification

OpenAI may require a challenge file at `/.well-known/openai-apps-challenge` on the MCP
host (or parent). **Do not add that route until the owner starts a real submission** —
the token is issued by the portal per submission.

## Tool annotation gap (flag for owner)

ChatGPT directory review requires `readOnlyHint`, `openWorldHint`, and `destructiveHint`
(with justifications) on every tool. Confirm the live `/api/mcp` tool descriptors meet
that bar before submitting; fixing annotations is out of scope for BY-18c.

## Test cases (placeholders)

Prepare before submit (portal requires five positive + three negative):

1. Positive: sign in, call `start` / `open_round` for an owned slug, receive workflow.
2. Positive: read round status after an agent signal.
3. Positive: list tools without a credential (handshake methods only).
4. Positive: refresh / re-auth after access credential expiry.
5. Positive: revoke the OAuth client from Studio and observe reconnect prompt.
6. Negative: call a write tool with no credential → 401 + PRM challenge.
7. Negative: call a write tool for a slug the account does not own → refusal.
8. Negative: reuse a revoked refresh credential → grant dead.

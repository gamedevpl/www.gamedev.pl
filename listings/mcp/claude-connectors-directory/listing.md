# Claude Connectors Directory — draft listing (NOT SUBMITTED)

**Status:** prepared for owner review. Do not publish.

## Sources (DOCUMENTED)

- Submission guide: https://claude.com/docs/connectors/building/submission
- Portal: https://claude.ai/admin-settings/directory/submissions/new
- Requires Team or Enterprise org + directory management access

## Proposed portal fields

| Field              | Draft value                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server URL         | `https://www.gamedev.pl/api/mcp`                                                                                                                                                                                                             |
| Transport          | Streamable HTTP                                                                                                                                                                                                                              |
| URL model          | Same URL for every user (universal)                                                                                                                                                                                                          |
| Server name        | gamedev.pl (≤100 chars)                                                                                                                                                                                                                      |
| Tagline            | Build browser games with your own coding agent (≤55)                                                                                                                                                                                         |
| Description        | Connect Claude to gamedev.pl so creators can open a self-build round, drive the gate, and publish browser games without pasting secrets into a prompt. Auth is OAuth or a creator-managed Authorization header configured in the MCP client. |
| Categories         | Developer tools / Gaming (pick in portal; max five)                                                                                                                                                                                          |
| Documentation URL  | https://www.gamedev.pl/studio                                                                                                                                                                                                                |
| Privacy policy URL | _(owner supplies — gated)_                                                                                                                                                                                                                   |
| Support contact    | _(owner supplies)_                                                                                                                                                                                                                           |
| Icon               | _(owner supplies asset)_                                                                                                                                                                                                                     |
| Listing slug       | `gamedev-pl` (permanent once published — confirm before submit)                                                                                                                                                                              |
| Authentication     | OAuth (DCR + CIMD on our AS)                                                                                                                                                                                                                 |
| Read/write         | Writes (creates/improves games)                                                                                                                                                                                                              |

## Prerequisites before submit (owner)

- Terms / consent clearance for public listing
- Privacy policy URL ready
- Tool annotations (`title`, `readOnlyHint` / `destructiveHint`) pass portal scan
- Reviewer test account / closed-beta access path for Anthropic reviewers

## Not a Claude Code plugin marketplace entry

Claude Code's plugin marketplace (`marketplace.json` / `/plugin`) is a different surface
for local plugins and bundled MCP configs. This artifact targets the **Connectors
Directory** remote-MCP path. A Claude Code plugin marketplace entry is intentionally
omitted until the owner asks for one — D5 forbids publishing an npm package, and a
plugin that only wraps our remote URL would still need a hosting decision.

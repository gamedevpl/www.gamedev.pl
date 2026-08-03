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

## Directory model (updated 2026-08-03)

- The directory is **two-tier**: submissions pass an automated scan and list as
  **community connectors**; Anthropic itself escalates high-usage listings to
  **verified** review (cannot be requested). One catalog serves Claude.ai, Desktop,
  Mobile, Claude Code, and Cowork.
  (https://claude.com/docs/connectors/directory,
  https://claude.com/docs/connectors/building/review-criteria)
- **Submission requires a Claude Team or Enterprise organization** (Owner/primary-owner
  role); individual Pro/Max plans cannot submit. Track status at
  `claude.ai/admin-settings/directory/submissions`; escalations `mcp-review@anthropic.com`.
- Review-criteria items we already meet: per-tool `title` + `readOnlyHint`/
  `destructiveHint` annotations, tool names ≤64 chars, separate read and write tools
  (no catch-all request tool).
- **Policy positioning note:** the review criteria list "AI generation of images/video/
  audio via AI models" as an unsupported use case. Our tools do not invoke media-
  generation models — the connector opens build rounds, relays briefs/feedback, and
  submits source files to a gate. Listing copy must describe it that way and avoid
  "AI generates your game" framing.
- Hosted-surface OAuth redirect: `https://claude.ai/api/mcp/auth_callback` must be
  accepted by our AS; Claude Code uses RFC 8252 loopback with port-agnostic matching
  (already supported). Anthropic egress range `160.79.104.0/21` if egress is ever
  restricted.

## Prerequisites before submit (owner)

- **Claude Team or Enterprise org** to access the submission portal
- Terms / consent clearance for public listing
- Privacy policy URL ready
- Reviewer test account with a **fully populated** account, reachable despite the
  closed beta

## Not a Claude Code plugin marketplace entry

Claude Code's plugin marketplace (`marketplace.json` / `/plugin`) is a different surface
for local plugins and bundled MCP configs. This artifact targets the **Connectors
Directory** remote-MCP path. A Claude Code plugin marketplace entry is intentionally
omitted until the owner asks for one — D5 forbids publishing an npm package, and a
plugin that only wraps our remote URL would still need a hosting decision.

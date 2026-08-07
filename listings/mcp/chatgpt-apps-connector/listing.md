# ChatGPT / Codex plugin — draft listing (NOT SUBMITTED)

**Status:** prepared for owner review. Do not publish.

This is now a **plugin** submission, not a bare connector: OpenAI's directory takes
skills + an MCP server + optional UI, and since #667 we have a skill to send. The server
half was always ready; the skill is what makes this a plugin rather than a URL.

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
| Skill               | `building-on-gamedev-pl` — [`listings/mcp/claude-plugin/skills/building-on-gamedev-pl/SKILL.md`](../claude-plugin/skills/building-on-gamedev-pl/SKILL.md)                                                                                                                                           |
| Authentication      | OAuth                                                                                                                                                                                                                                                                                               |
| Website             | https://www.gamedev.pl                                                                                                                                                                                                                                                                              |
| Support URL         | _(owner supplies)_                                                                                                                                                                                                                                                                                  |
| Privacy policy URL  | _(owner supplies — gated)_                                                                                                                                                                                                                                                                          |
| Terms URL           | _(owner supplies — gated)_                                                                                                                                                                                                                                                                          |
| Category            | Developer tools / Games                                                                                                                                                                                                                                                                             |
| Logo                | _(owner supplies)_                                                                                                                                                                                                                                                                                  |

## The skill half

The directory accepts a skill two ways, and the choice matters:

- **Upload a bundle** — the same file tree tested locally. One file for us: `SKILL.md`, no
  scripts or assets.
- **Import from the MCP server** via _Scan Tools_ — taken as a **submission-time
  snapshot**, so it freezes on their side and does not follow later edits.

Either way the copy in the directory can go stale. That is survivable here precisely
because of how the skill is written: it defers to the workflow `start` returns and says
the server wins on any disagreement, so a frozen snapshot degrades to slightly dated
framing rather than to wrong instructions. Keep that property if the skill is ever
rewritten for this listing — a skill that restated the session loop would rot into
contradicting the live server.

Ship the same `SKILL.md` the plugin already ships. A ChatGPT-specific fork would be a
second copy of the loop to keep in sync, which is the failure `plugin-manifests.test.ts`
exists to prevent.

## Domain verification

OpenAI may require a challenge file at `/.well-known/openai-apps-challenge` on the MCP
host (or parent). **Do not add that route until the owner starts a real submission** —
the token is issued by the portal per submission.

## Directory change (2026-07-09) and submission notes

- The App Directory was replaced by a universal **Plugin directory** shared by ChatGPT
  **and Codex**; a plugin = skills + MCP server + optional Apps-SDK UI. Existing apps
  were auto-migrated. Portal: https://platform.openai.com/plugins (overview:
  https://developers.openai.com/plugins, help: https://help.openai.com/en/articles/20001256).
- Submission requires completed **developer identity verification** on the Platform org,
  a **demo account with no MFA and no signup steps** (either causes rejection), 3–5
  screenshots taken inside ChatGPT developer mode, and a 512×512 PNG icon.
- Third-party reports put review at roughly 5–10 business days; no official SLA.
- Also required at submission: a **content security policy** naming the exact domains the
  plugin fetches, **starter prompts** showing realistic workflows, and **release notes**
  summarising the scope of the submission.

## Tool annotations: requirement met

ChatGPT directory review requires `readOnlyHint`, `openWorldHint`, and `destructiveHint`
on every tool. The live `/api/mcp` descriptors carry `title` plus all four hints on all
tools; the earlier gap flagged during BY-18c has been closed.

Verify before submitting:

- Annotation sets are the `READS` / `WRITES` / `WRITES_ONCE` / `CONSUMES` constants in
  `apps/api/src/mcp-server.ts` (~L521–551), spread into each tool's `annotations`.
- The regression test is `apps/api/src/mcp-server.test.ts` → _"annotates every tool, so a
  reader is not advertised as destructive"_ (~L1149), which asserts every tool has
  `title` + a boolean `destructiveHint`, and pins the reader/writer split per tool name.

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

## What is owner-gated

Everything below needs the owner; none of it can be prepared in-repo:

1. **Developer identity verification** on the OpenAI Platform org (individual or business),
   matching the publisher details on the listing.
2. **Support, privacy-policy and terms URLs**, and a 512×512 PNG icon.
3. **A demo account** with no MFA, no SMS, and no signup step — any of the three is a
   rejection. Note the tension with the account requirement: the reviewer needs an account
   that can actually open a round, so this is a real provisioning decision, not a form
   field.
4. **Starting the submission**, which mints the `/.well-known/openai-apps-challenge` token.
   The route stays unbuilt until then.

The eight test cases above and the field table are ready to paste; the four items here are
the whole remaining cost.

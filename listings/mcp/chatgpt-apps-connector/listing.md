# ChatGPT / Codex plugin — listing (SUBMITTED, REJECTED 2026-08-22 — remediation in progress)

**Status:** v1.0.0 was submitted and rejected on 2026-08-22. Remediate below, then
re-submit from the OpenAI Platform dashboard.

## Review round 1 (2026-08-22): rejected — findings and remediation

Four findings, verbatim themes from the rejection email, with where each stands:

1. **"Returns user-related data not disclosed in your privacy policy"** (including
   nested and debug data). The MCP surface returns the creator's round data — brief/spec,
   steering messages and the paged conversation transcript, reference images, source
   files, progress notes, screenshots, gate verdicts/media, plus status metadata (round
   and delivery ids, timestamps, warning codes). None of that was named in the privacy
   policy, which also never mentioned the connector lane at all.
   **Fixed in repo:** `apps/web/src/legal/privacy.{en,pl}.ts` gained section 5
   ("Connecting your own AI assistant (agent interface)") enumerating each returned
   category, the status/debug metadata, the no-account-identity guarantee (the surface
   returns no email/name/account id — verified against `mcp-server.ts` and
   `agent-channel.ts`), and the recipient relationship (the assistant provider acts on
   the creator's instruction, not as our processor).
   **Owner:** deploy before re-submitting, so the privacy-policy URL on the listing shows
   the new section; decide whether the effective-date/14-day-notice clause needs a bump.
2. **"Could not confirm that the verified individual or business owns this app."**
   Entirely owner-gated, nothing in-repo: complete business/identity verification on the
   OpenAI Platform org that submits, or re-submit from the account that carries the
   verification, and make sure the publisher name matches who owns the gamedev.pl domain
   and brand. Domain verification via `/.well-known/openai-apps-challenge` (below) is the
   supporting evidence — do that step this time.
3. **"Annotations do not appear to match the tool's behavior … explicitly true or false
   (not null) for every tool … include a clear justification."** The live descriptors
   were already explicit booleans for all four hints on every tool, but
   [`tool-annotations.md`](./tool-annotations.md) — the paste-ready justification sheet —
   had lagged the advertised surface: seven advertised tools (`regenerate_seed`,
   `get_kit_api`, `knowledge_query`, `stage_upload_url`, `delete_source_file`,
   `get_reference_images`, `get_transcript`) had no blocks, and seven REST-only tools
   that models never see were still listed. **Fixed in repo:** the sheet now covers
   exactly `MCP_VISIBLE_TOOLS` (36 tools) with explicit values and justifications for
   all four hints, idempotency included.
4. **"Tool naming and description quality … no comparative, biased, or preferential
   language."** Names are unchanged (snake_case verbs, unique, behavior-matching
   `annotations.title` on each), but descriptions carried "Preferred way to…",
   "PREFERRED:", "Prefer X over Y", "better for…", and one competitor product name
   ("Claude Chat") — all in `apps/api/src/mcp-server.ts`. **Fixed in repo:** every
   advertised tool description and schema property description now states neutrally when
   to use the tool ("Use X when…"); the competitor mention is gone. Deploy before
   re-submitting so the reviewed `tools/list` reflects it.

Re-submission preflight: deploy the API (descriptions) and web (privacy policy) first,
then walk the "What is owner-gated" list at the bottom — verification (finding 2), demo
account, URLs, icon — and paste the regenerated annotation blocks per tool.

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
| Skill               | `gamedevpl` — [`skills/gamedevpl/SKILL.md`](../../../skills/gamedevpl/SKILL.md), the root copy the installers read (byte-identical to the plugin's)                                                                                                                                                 |
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

Ship the same `SKILL.md` the repo already ships — the root `skills/gamedevpl/` copy, which
`plugin-manifests.test.ts` pins byte-identical to the plugin's. A ChatGPT-specific fork
would be a third copy of the loop to keep in sync, which is the failure that test exists
to prevent.

## Domain verification

The route is already live and already wired: `apps/api/src/openai-apps-challenge.ts`
serves `GET /.well-known/openai-apps-challenge` from `OPENAI_APPS_CHALLENGE_TOKEN`
(404 when unset), and `.github/workflows/deploy.yml` — the actual CI/CD path, not
`infra/deploy-api.sh` (that one is owner-run, local-only, never invoked by CI) —
already threads it from the GitHub Actions repo **variable** `vars.OPENAI_APPS_CHALLENGE_TOKEN`
into every automated deploy, same pattern as `MP_RELAY_URL`/`ZONE_HOST_URL`/`REMIX_DEBUG`.
Confirmed live 2026-08-23: the endpoint already returns a token, so this variable is
already set. Nothing to build, nothing to redo on every deploy — only owner steps:

1. Start (or resume) the submission on the OpenAI Platform portal; it issues a token
   for domain verification.
2. Set (or confirm) the **Actions variable** `OPENAI_APPS_CHALLENGE_TOKEN` in this
   repo's Settings → Secrets and variables → Actions → Variables (a variable, not a
   secret — the whole point is that it's public). A merge to `master` deploys it
   automatically from there; no manual Cloud Run edit, no `infra/deploy-api.sh` run
   needed for the normal path.
3. Let OpenAI fetch and verify it, then clear the Actions variable once verification
   is done (it is not needed outside an active submission) — clearing it takes effect
   on the next deploy, same threading rule in reverse.

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
  `apps/api/src/mcp-server.ts` (search for "Tool annotations, and why every tool needs
  them"), spread into each tool's `annotations`.
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

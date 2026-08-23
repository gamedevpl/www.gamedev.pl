# MCP listing artifacts (BY-18c)

The **official MCP Registry entry is published and live**. Every other listing in this
folder is still a draft for the owner to submit later — do not publish them to any
registry, directory, or marketplace without the owner clearing it.

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

| Path                                                                                 | Target                                  | Status                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`official-registry/server.json`](./official-registry/server.json)                   | Official MCP Registry                   | ✅ **Published 2026-08-06** as `pl.gamedev/creator` 1.0.1 — see below                                                                                                                                                                                                                                                          |
| [`github-mcp-registry/listing.md`](./github-mcp-registry/listing.md)                 | GitHub MCP Registry (Copilot, VS Code)  | Prerequisite now met (official-registry publication); curation request to partnerships@github.com is owner-gated                                                                                                                                                                                                               |
| [`claude-plugin/`](./claude-plugin/)                                                 | Claude plugin (self-hosted marketplace) | No submission and no review — users add `gamedevpl/www.gamedev.pl` as a marketplace. Catalog: [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json). Ships the [`gamedevpl`](./claude-plugin/skills/gamedevpl/SKILL.md) skill, and doubles as an [Agent Plugins](https://agent-plugins.org) 1.0.0 package |
| [`cursor-directory/listing.md`](./cursor-directory/listing.md)                       | Cursor Marketplace + cursor.directory   | Draft — https://cursor.com/marketplace/publish (official, reviewed) and https://cursor.directory/plugins/new (community)                                                                                                                                                                                                       |
| [`claude-connectors-directory/listing.md`](./claude-connectors-directory/listing.md) | Claude Connectors Directory             | Draft — portal at https://claude.ai/admin-settings/directory/submissions/new (**requires Team/Enterprise org**)                                                                                                                                                                                                                |
| [`chatgpt-apps-connector/listing.md`](./chatgpt-apps-connector/listing.md)           | ChatGPT + Codex Plugin directory        | ❌ v1.0.0 **rejected 2026-08-22** (privacy disclosure, owner verification, annotation justifications, description language) — remediation recorded in the listing; re-submit at https://platform.openai.com/plugins after deploying the fixes                                                                                  |

Not a listing: **[Agent Plugins](https://agent-plugins.org) 1.0.0** is a portable package
format, not a registry — no submission exists and none is expected. The Claude plugin
directory carries the spec's `plugin.json` + `mcp.json` alongside Claude's own manifests
so one directory installs either way. D5 is untouched: those are manifests in this repo,
not a package we publish or maintain a release pipeline for.

Skill registries are tracked separately in [`listings/skills/`](../skills/README.md).
The skill ships inside the Claude plugin, which reaches only people who already added our
marketplace — the directories listed there are the distribution half, and none of them is
run by Anthropic.

Not pursued: the **Gemini CLI extensions gallery** would be self-serve (public manifest
repo + `gemini-cli-extension` topic, crawled daily), but listing there requires a
dedicated repo because the manifest must sit at a repo root — too much standing surface
for the reach that surface has today. The consumer Gemini app has no third-party MCP
channel at all. Revisit only if Gemini CLI adoption changes.

## What the server exposes

Every tool advertised to a connecting client, grouped by where it falls in a
build round; the authoritative list is whatever `tools/list` returns, and
`plugin-manifests.test.ts` fails if this table drifts from it.

| Tool                     | What it does                            |             |
| ------------------------ | --------------------------------------- | ----------- |
| `create_game`            | Create a game                           | write       |
| `start`                  | Start or rejoin a build round           | write       |
| `open_round`             | Open an improvement round               | write       |
| `continue_draft`         | Continue an unpublished draft           | write       |
| `get_brief`              | Read the build brief                    | read        |
| `get_seed`               | Fetch the seed draft                    | read        |
| `regenerate_seed`        | Regenerate the seed draft               | destructive |
| `get_sources`            | Fetch existing game sources             | read        |
| `get_kit`                | Fetch the Creator Kit                   | read        |
| `get_kit_api`            | Fetch the Creator Kit's API reference   | read        |
| `list_kit_files`         | List Creator Kit files                  | read        |
| `search_kit_files`       | Search Creator Kit files                | read        |
| `read_kit_file`          | Read one Creator Kit file               | read        |
| `read_kit_files`         | Read several Creator Kit files          | read        |
| `read_kit_file_fragment` | Read a Creator Kit file fragment        | read        |
| `knowledge_query`        | Ask GameKit/EditorKit/docs a question   | read        |
| `stage_source_file`      | Stage one source file                   | destructive |
| `patch_source_file`      | Edit one or more staged source files    | destructive |
| `delete_source_file`     | Delete one staged source file           | destructive |
| `clear_staged_sources`   | Clear staged source files               | destructive |
| `list_staged_sources`    | List staged source files                | read        |
| `stage_upload_url`       | Get stage upload URL(s)                 | write       |
| `submit_sources`         | Deliver sources to the gate             | destructive |
| `end`                    | End (commit) this round                 | destructive |
| `get_gate_verdict`       | Check the gate once                     | read        |
| `get_gate_media`         | Fetch the gate's screenshots and video  | read        |
| `get_reference_images`   | Fetch creator-attached reference images | read        |
| `report_progress`        | Report progress                         | destructive |
| `screenshot_upload_url`  | Get a screenshot upload URL             | write       |
| `show_round`             | Show the creator a live round card      | read        |
| `show_media`             | Show the creator the gate's screenshots | read        |
| `read_inbox`             | Read creator messages                   | read        |
| `ack_inbox`              | Acknowledge creator messages            | destructive |
| `get_transcript`         | Read the creator conversation           | read        |

The third column is the tool's own `annotations`, not a summary written here: `read` is
`readOnlyHint`, `destructive` is `destructiveHint`. Nine tools are destructive, and the
protocol's opposite of destructive is _additive_, not "deletes" — a client may skip its
approval prompt for anything marked non-destructive, so anything that consumes or
overwrites is marked honestly even when nothing is erased. What each one actually does:

- `stage_source_file` overwrites the same path if staged again;
- `patch_source_file` can remove lines;
- `delete_source_file` and `clear_staged_sources` delete staged files;
- `regenerate_seed` consumes a capped regeneration and replaces the current draft;
- `submit_sources` burns one of a capped number of deliveries and can move the pointer
  that decides what publishes;
- `report_progress` sends a persistent creator-thread message;
- `end` can send a closing message and acknowledge creator messages;
- `ack_inbox` makes creator messages stop appearing.

The staging tools touch scratch space, which is undelivered by definition. The others
consume bounded actions or have effects a creator sees, which is why they carry the hint.

**Not in that list, deliberately.** `get_round_status` and `get_round_media` appear only
for a client that negotiates the UI extension, since a client with no views would offer
them to its model. Seven more — the proposal tools (`open_proposal_round`,
`submit_proposal`, `get_proposal_status`) and the exemplar tools (`list_examples`,
`get_example`, `list_example_files`, `read_example_file`) — are callable but never
advertised and never named to a model (`MCP_UNADVERTISED_TOOLS`). An agent will not
discover them, so do not write a client, a listing or a test case that expects to.

**Every one of them needs an approved creator account.** The tools load for anyone; the
calls are refused without one. That is the gate, not an outage.

## The official registry entry

Live at
`https://registry.modelcontextprotocol.io/v0.1/servers?search=pl.gamedev`.

**Namespace ownership is proved by DNS.** A `v=MCPv1; k=ed25519; p=…` TXT record on the
`gamedev.pl` apex carries the public key; the private half was generated inside Google KMS
and is **non-exportable**, so no key file exists anywhere to store, leak, or rotate:

```
projects/gamedevpl/locations/global/keyRings/mcp/cryptoKeys/registry/cryptoKeyVersions/1
```

That resource path is not a secret — possession of it grants nothing without IAM on the
project.

### Publishing

```bash
# server.json minus the repo-side marker block, which is not registry content
jq 'del(._meta["pl.gamedev/listing"])' listings/mcp/official-registry/server.json > /tmp/server.json
cd /tmp

mcp-publisher validate
mcp-publisher login dns google-kms --domain=gamedev.pl \
  --resource=projects/gamedevpl/locations/global/keyRings/mcp/cryptoKeys/registry/cryptoKeyVersions/1
mcp-publisher publish
```

`login` needs application-default credentials (`gcloud auth application-default login`)
and prints the **expected proof record** before it signs. Prefer that printed value over
re-deriving the key by hand — it cannot drift from what the registry will actually check.

The registry JWT that `login` returns is **short-lived**, so run `publish` right after it.
A stale token fails with `401 … token is expired`, which reads like a broken key or a bad
DNS record and is neither — just log in again. Nothing about the key or the TXT record
needs touching.

### Two things that will bite

**The registry silently drops custom `_meta` keys.** Only
`_meta["io.modelcontextprotocol.registry/publisher-provided"]` is preserved; everything
else is discarded with no warning and no error. Our `pl.gamedev/auth` block is therefore
**not** in the published entry. That is fine — it is valid for the
`/.well-known/mcp/server.json` copy, where the generic `server.json` spec does permit
custom reverse-DNS namespaces, and clients find OAuth through standard discovery on the
remote URL regardless. But anything the registry genuinely needs to carry must go under
that one key (4 KB limit).

**The apex TXT record set is shared.** SPF and Google Search Console verification live in
the same record set. Route 53 `UPSERT` replaces the set wholesale, so any change must
re-send all three values — omitting them breaks mail and Search Console silently.

## When you need to republish

Published versions are **immutable**: re-publishing an existing version number is rejected
outright, so every change ships as a version bump in `server.json` (cap: 10 000 versions
per server). Republish when any of these change:

| Change                                        | Republish?                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The MCP endpoint URL (`remotes[].url`)        | **Yes — urgent.** Clients resolve the server from this. A stale URL is a broken integration for everyone who installed from the registry |
| `description`, `title`, `websiteUrl`          | Yes, when you want the change reflected — the registry serves its own copy and does not re-crawl `/.well-known/`                         |
| Adding or removing a transport / remote       | Yes                                                                                                                                      |
| Repository URL moves                          | Yes                                                                                                                                      |
| Anything under `publisher-provided` `_meta`   | Yes                                                                                                                                      |
| Server goes away, or is superseded            | No — use `mcp-publisher status --status deprecated\|deleted` instead of a publish                                                        |
| Editing `/.well-known/mcp/server.json` only   | **No** — that copy is served live by the app and is independent                                                                          |
| Editing the `pl.gamedev/listing` marker block | **No** — repo-side bookkeeping, stripped before publishing                                                                               |
| Rotating the KMS key                          | **No.** Update the DNS TXT record to the new public key; that re-authorises publishing but does not change the entry                     |

Bump `version` in `official-registry/server.json` in the same commit as whatever
substantive change prompted it, so the repo and the registry cannot disagree about what
1.0.x means.

Lifecycle changes do not go through `publish` at all:

```bash
mcp-publisher status --status deprecated --message "…" pl.gamedev/creator 1.0.0
```

## One-click install (product surface, not a listing)

On the Studio connect card, credential-free deep links install the **server URL only**:

- Cursor: `cursor://anysphere.cursor-deeplink/mcp/install?…`
- VS Code: `vscode:mcp/install?…`

A one-click install link must never carry a credential. Auth is OAuth discovery or a
header the creator fills in afterwards. Clients without a credential-free deep-link format
keep the hand-copy config block (Claude Code, Codex, Kimi, CLI).

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

| Path                                                                                 | Target                                  | Status                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`official-registry/server.json`](./official-registry/server.json)                   | Official MCP Registry                   | ✅ **Published 2026-08-06** as `pl.gamedev/creator` 1.0.1 — see below                                                                                                                                                                                                                                                                                    |
| [`github-mcp-registry/listing.md`](./github-mcp-registry/listing.md)                 | GitHub MCP Registry (Copilot, VS Code)  | Prerequisite now met (official-registry publication); curation request to partnerships@github.com is owner-gated                                                                                                                                                                                                                                         |
| [`claude-plugin/`](./claude-plugin/)                                                 | Claude plugin (self-hosted marketplace) | No submission and no review — users add `gamedevpl/www.gamedev.pl` as a marketplace. Catalog: [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json). Ships the [`building-on-gamedev-pl`](./claude-plugin/skills/building-on-gamedev-pl/SKILL.md) skill, and doubles as an [Agent Plugins](https://agent-plugins.org) 1.0.0 package |
| [`cursor-directory/listing.md`](./cursor-directory/listing.md)                       | Cursor Marketplace + cursor.directory   | Draft — https://cursor.com/marketplace/publish (official, reviewed) and https://cursor.directory/plugins/new (community)                                                                                                                                                                                                                                 |
| [`claude-connectors-directory/listing.md`](./claude-connectors-directory/listing.md) | Claude Connectors Directory             | Draft — portal at https://claude.ai/admin-settings/directory/submissions/new (**requires Team/Enterprise org**)                                                                                                                                                                                                                                          |
| [`chatgpt-apps-connector/listing.md`](./chatgpt-apps-connector/listing.md)           | ChatGPT + Codex Plugin directory        | Draft — https://platform.openai.com/plugins (identity-verified Platform org)                                                                                                                                                                                                                                                                             |

Not a listing: **[Agent Plugins](https://agent-plugins.org) 1.0.0** is a portable package
format, not a registry — no submission exists and none is expected. The Claude plugin
directory carries the spec's `plugin.json` + `mcp.json` alongside Claude's own manifests
so one directory installs either way. D5 is untouched: those are manifests in this repo,
not a package we publish or maintain a release pipeline for.

Not pursued: the **Gemini CLI extensions gallery** would be self-serve (public manifest
repo + `gemini-cli-extension` topic, crawled daily), but listing there requires a
dedicated repo because the manifest must sit at a repo root — too much standing surface
for the reach that surface has today. The consumer Gemini app has no third-party MCP
channel at all. Revisit only if Gemini CLI adoption changes.

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

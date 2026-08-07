# Skill registry listings

Where the [`building-on-gamedev-pl`](../mcp/claude-plugin/skills/building-on-gamedev-pl/SKILL.md)
skill can be listed, and what to paste when submitting.

The skill ships inside the Claude plugin, which is how it reaches anyone who has already
added our marketplace. That is not distribution — it only reaches people who already found
us. These listings are the distribution half.

**None of these is run by Anthropic.** There is no official skill registry the way there is
an official MCP registry; `SKILL.md` is an open format and the directories below are
community-run, of unproven longevity. Budget effort accordingly: submitting is cheap,
maintaining a presence on five directories that may not exist in a year is not. The
official MCP registry entry remains the durable listing.

## Targets

| Target                                                                       | Mechanism                                                                                          | Status                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| [Skills Directory](https://www.skillsdirectory.com/)                         | Web form, reviewed before publishing                                                               | Draft — owner-gated                   |
| [Claude Skills Club](https://claudeskills.club/submit)                       | Web form; they run a security audit and open a PR                                                  | Draft — owner-gated                   |
| [claude-skill-registry](https://github.com/majiayu000/claude-skill-registry) | PR to `majiayu000/claude-skill-registry-core` (**not** the generated `claude-skill-registry` repo) | Draft — needs a fork outside this org |
| [claudemarketplaces.com](https://claudemarketplaces.com/)                    | Curated directory covering skills, plugins and MCP servers                                         | Draft — owner-gated                   |
| SkillsMP                                                                     | Crawls GitHub automatically; no submission                                                         | **Blocked by a decision — see below** |
| [cursor.directory](https://cursor.directory/) rules                          | Separate slot from the plugin entry already submitted                                              | Draft — owner-gated                   |

## The SkillsMP problem

SkillsMP indexes any repo with a `SKILL.md` at the root or under `.claude/skills/*/`,
picked up from the `claude-skill` / `claude-code` / `anthropic` GitHub topics.

Our skill is at `listings/mcp/claude-plugin/skills/building-on-gamedev-pl/`, which is
neither path, so it will not be indexed as things stand. Moving it is not obviously right:

`.claude/skills/` in this repo holds **eight internal skills** — `internal-ops-repo`,
`managing-beta-participants`, `browse-live-site` and friends. They are tooling for agents
working _on_ this repo, not for anyone using gamedev.pl. Adding the crawler topics would
invite an aggregator to list all of them. Nothing there is secret (the directory is already
public), but `internal-ops-repo` exists to describe a private repo's contents, and
promoting it into a public skills directory is noise at best. Nine skills listed, one of
them relevant, also buries the one we want found.

So the choice is:

- **Manual registries only** (recommended). Submit the one skill by hand to the reviewed
  directories above. Precise, and the internal skills stay unlisted. Skip the crawler
  topics.
- **Add the crawler topics** (`claude-skill`, `claude-code`, `anthropic`) and accept that
  the internal skills get indexed alongside.

Recommended: the first. Auto-indexing buys reach we do not control and cannot curate.

## Submission text

Everything below is paste-ready and matches the registry entry and the plugin manifests —
same name, same one-line description, same endpoint. Keep them in lockstep; four manifests
naming one endpoint is the drift `plugin-manifests.test.ts` already exists to catch.

### Name

```
building-on-gamedev-pl
```

### One-line description

```
Build browser games on gamedev.pl from your coding agent.
```

### Longer description

```
gamedev.pl publishes small browser games to a public catalog. Creators connect their own
coding agent over a remote MCP server, which builds and revises the game through a review
gate and publishes it.

This skill is the part an agent needs before the first tool call: what a build round is,
how to get into one, and the handful of loop rules that cost a whole build when missed —
screenshot early, stage rather than re-upload, staging is not delivering, call end after
the last submit, never poll the gate or the inbox.

It deliberately does not restate the session workflow. The server returns that on start
and wins on any disagreement, so the skill cannot drift out of date as the loop changes.
```

### Repository / source

```
https://github.com/gamedevpl/www.gamedev.pl
```

### Skill path

```
listings/mcp/claude-plugin/skills/building-on-gamedev-pl/SKILL.md
```

### Licence

```
GPL-3.0-only
```

### Note for reviewers

Include this wherever a directory offers a free-text field. A reviewer who installs the
skill and then finds every tool refused would otherwise reasonably log it as broken.

```
Creating games on gamedev.pl is currently in closed beta. The skill and the MCP tools load
for anyone, but every tool call needs an approved creator account — join the waitlist at
https://www.gamedev.pl. The server states this on connect and in its refusals, so an agent
without an account is told why rather than left retrying.
```

# Skill registry listings

Where the [`gamedevpl`](../mcp/claude-plugin/skills/gamedevpl/SKILL.md)
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
| [skills.sh](https://www.skills.sh/)                                          | No submission — `npx skills add gamedevpl/www.gamedev.pl` clones this repo directly                | ✅ Live, nothing to do — see below    |
| SkillsMP                                                                     | Crawls GitHub automatically; no submission                                                         | Not indexed — see below               |
| [cursor.directory](https://cursor.directory/) rules                          | Separate slot from the plugin entry already submitted                                              | Draft — owner-gated                   |

## The installers read the repo, not a listing

[skills.sh](https://www.skills.sh/) — Vercel's installer, targeting 76 agents including
Cursor, Codex, Cline and Windsurf — has no submission step at all. `npx skills add
gamedevpl/www.gamedev.pl` clones this repo and installs what it finds. So the listing is
the repo, and the only question that matters is which paths get read.

It walks the repo root, `skills/` and `.claude/skills/`, three levels deep. Run before the
root copy existed, it found nine skills, installed every internal one, and missed the only
skill written for the person typing the command. That is why `skills/gamedevpl/` exists at
the root — see the byte-identical guard in `plugin-manifests.test.ts`.

The consequence worth remembering: **this needs no opt-in.** Anyone can run that command
today. There is no topic to withhold and no crawler to avoid, so the eight internal skills
in `.claude/skills/` — `internal-ops-repo`, `managing-beta-participants`,
`browse-live-site` and friends — are installable alongside ours whether we like it or not.
Nothing there is secret and the directory is already public; contorting the repo to hide
tooling is a worse trade than the noise. What matters is that the product skill is now
found beside them rather than missing.

SkillsMP is the opposite case: it indexes from the `claude-skill` / `claude-code` /
`anthropic` GitHub topics, which this repo does not carry, so nothing is indexed there.
Adding those topics is the one remaining opt-in decision, and the recommendation is to
skip it — auto-indexing buys reach we cannot curate, and the root `skills/` copy already
serves the installer that people actually run.

## Submission text

Everything below is paste-ready and matches the registry entry and the plugin manifests —
same name, same one-line description, same endpoint. Keep them in lockstep; four manifests
naming one endpoint is the drift `plugin-manifests.test.ts` already exists to catch.

### Name

```
gamedevpl
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
skills/gamedevpl/SKILL.md
```

That is the root copy, which is what the installers read. The plugin ships a
byte-identical copy at `listings/mcp/claude-plugin/skills/gamedevpl/SKILL.md`; a test
pins the two together.

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

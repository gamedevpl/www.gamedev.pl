# Risks & Open Questions

This list covers the games-repo architecture. Container-generation risks are historical; the
app no longer runs agents on behalf of creators.

## Product blockers

### B1 — Submission rights and moderation

Specs will enter a public repository and influence published games. Before public submission is
enabled, decide what submitters agree to, how attribution works, what content is prohibited,
who reviews it, and how takedowns are handled.

### B2 — Games-repo ownership and publication

The dedicated repository, merge authority, initial hosting target, and publication rollback
process are not yet established. The catalog and submission API should not be built against an
invented output or status contract.

### B3 — Submission identity and abuse controls

Issue creation spends repository reputation and moderation capacity. Public submission needs
reliable attribution, rate limits, spam controls, collision handling, and a policy for repeat
abuse before repository credentials are exposed through an API.

## Ongoing security risks

| #   | Risk                            | Current direction                                                                                              |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| R1  | Sandbox regression              | Keep `sandbox="allow-scripts allow-pointer-lock"` without `allow-same-origin`; add an automated invariant test |
| R2  | Game network access             | Reject remote dependencies and publish a restrictive CSP on a separate cookieless origin                       |
| R3  | CPU/memory abuse                | Bundle limits, browser smoke tests, reporting, and takedown                                                    |
| R4  | Malicious or injected spec text | Treat specs as data, constrain agent PR scope, review before merge                                             |
| R5  | Supply-chain compromise         | Secretless PR checks, least-privilege workflows, pinned actions, protected publishing                          |
| R6  | Offensive/infringing content    | Human moderation, clear rights, and takedown procedures                                                        |
| R7  | Catalog or bundle tampering     | Schema validation, protected publishing, integrity/versioning, and rollback                                    |

## Open product and platform questions

| #   | Question                                                                                     |
| --- | -------------------------------------------------------------------------------------------- |
| Q3  | What exact frontmatter fields and catalog schema are version 1?                              |
| Q4  | How are submissions attributed, consented, moderated, rate-limited, and tracked?             |
| Q5  | Which issue/PR states become creator-visible statuses?                                       |
| Q6  | When does one repository stop scaling operationally, and what metric triggers revisiting it? |
| Q7  | Does the mock generation preview remain developer-only after the catalog lands?              |
| Q8  | Which hosting platform serves the web app and minimal submission API?                        |

## Resolved architecture decisions

- Games live in one dedicated repository rather than one repo per creator or per game.
- The spec is the source of truth; implementation follows it.
- Agents propose pull requests in that repository; gamedev.pl does not execute them.
- Creation is asynchronous: submission → issue → agent PR → review → publication.
- Agent output is never auto-merged.
- Published games remain untrusted and render in the existing sandboxed iframe.
- The auth proxy, job tokens, container runner, and in-process orchestrator were removed.
- The earlier credential-exfiltration and subscription-compute blockers dissolved with that
  removal; they are not active implementation tasks.
- **(was Q1) The games repository is `gamedevpl/www.gamedev.pl-games`, and it is private.**
  The owner merges agent PRs; that review is the moderation point of the issue-first flow.
- **(was Q2) There is no separate public games origin.** Games are read from the private repo
  and assembled by the API ([`apps/api/src/github-client.ts`](../apps/api/src/github-client.ts)),
  not published to Pages or a CDN. This is what lets the games repo stay private and makes
  unmerged PR builds playable as previews. The sandbox — not a separate origin — is what
  isolates game code.

## Safety invariants

- Never add `allow-same-origin` to the game iframe.
- Never render game code directly in the app document.
- Never give an untrusted PR or game bundle production credentials.
- Never let public spec/issue text expand an agent's scope beyond one game directory.
- Never auto-merge agent-authored game changes.

# The Games Repo — agent-maintained games

> **Status: 📋 Design agreed, not built.** This supersedes the container-based
> generation architecture, which has been removed (see "Why this replaced the previous
> design" below).

## The shape

Games live in a **dedicated games repository**, one monorepo for all of them. Each game is a
directory containing a **spec** (the source of truth) and its implementation:

```
games/
  dodge-the-rocks/
    SPEC.md          ← source of truth, including catalog frontmatter
    GAME.json        ← shared-engine module selection
    CAPTURE.json     ← deterministic play, assertion, and capture scenario
    index.html
    game.ts
    style.css
    media/
      opening.png
      <named-moment>.png
      gameplay.mp4
      metadata.json  ← filenames plus source-freshness fingerprint
  coin-catcher/
    ...
.github/
  copilot-instructions.md   ← how agents maintain games here
  workflows/
    validate.yml            ← every game builds and loads
    publish.yml             ← publish bundles for gamedev.pl to serve
```

The games repository contains TypeScript executable sources only. Its build tooling and this
app's GitHub client transpile those sources into dependency-free JavaScript before browser delivery.

**Coding agents maintain that repo.** GitHub Copilot works on it autonomously — fixing
problems, and bringing each game into line with its current spec. Claude Code / Codex / agy
can be brought in as extra hands on the same repo when needed.

The gamedev.pl app is a **catalog and player** over that repo, plus a way for creators to
submit specs.

## The core idea: the spec is the source of truth

A game's `SPEC.md` describes what the game should be. The code is an _implementation_ of the
spec, and it can drift or be wrong. Agents' standing job is to close that gap.

This reframes generation as **maintenance**, which is a much better fit for how coding agents
actually work:

- "Game X doesn't match its spec" → an agent fixes the implementation.
- "Here's a spec for a new game" → an agent implements it.
- "A player wants this change" → the spec is amended, then the implementation follows.

It also makes the **remix loop** natural rather than bolted on: a remix is a proposed change
to a spec, reviewed like any other change (see [`remix-to-pr.md`](./remix-to-pr.md)).

## Why this replaced the previous design

The earlier architecture had gamedev.pl run coding agents **on behalf of creators**, in
containers we operated, using credentials we held. That was abandoned for **legal reasons**:
operating agent compute as a multi-tenant service for third parties is a materially different
proposition from using a coding agent on your own repository — the licensed, ordinary case.

The new design sidesteps it entirely. Agents work on **our repo, for us**, which is exactly
what they're meant to do. Nobody's prompt triggers agent execution we operate.

Two consequences worth noting:

- ✅ **The credential-exfiltration problem (B0) dissolves.** Not fixed — _removed_. There is no
  longer any container of ours running untrusted prompts, and so nowhere to put a credential
  that could leak. The auth proxy, job tokens, and agent-runner container were deleted.
- ✅ **The subscription-ToS blockers (B1/B2) dissolve too**, for the same reason.

Removed in this pivot (recoverable from git history): `containers/agent-runner`,
`apps/auth-proxy`, `packages/job-auth`, and `ContainerGameGenerator`. They worked — the
container ran a real agent through an auth proxy with per-job tokens — but they solved a
problem this design no longer has.

## The product consequence: creation is asynchronous

This is the significant trade and it should be designed for, not discovered:

|                     | Old               | New                                              |
| ------------------- | ----------------- | ------------------------------------------------ |
| **Playing** a game  | Instant           | **Instant** (static bundles)                     |
| **Creating** a game | ~30s, synchronous | **Asynchronous** — spec → agent → PR → published |

Creation becomes closer to _commissioning_ a game than _generating_ one. The UI must set that
expectation honestly: submitted specs need visible status ("queued", "an agent is working on
it", "published"), and the catalog should be full enough that arriving users have something to
play immediately.

## Trust boundaries

Two remain, and they're simpler than before.

**1. Generated game code is still untrusted.** It's written by an agent, and later influenced
by creator specs and player remix requests. It runs in the player's browser, so the existing
invariant is unchanged and non-negotiable: `sandbox="allow-scripts"` with **no
`allow-same-origin`** (see [`security-model.md`](./security-model.md)). Serving games from a
separate, cookieless origin remains the right call.

**2. Creator-submitted specs are untrusted input.** The app files them into our repo under our
identity, which is content submission rather than compute-on-behalf — a much weaker concern
than the one we just removed, but not nothing:

- **Abuse/spam**: rate-limit submissions; don't let anyone flood the repo with issues.
- **Moderation**: spec text lands in a public repo under our identity. It needs review before,
  or shortly after, it appears.
- **Attribution**: record who submitted a spec, and be clear about what rights that implies.
- **Prompt injection**: a spec is read by agents, so it can attempt to steer them. Agents
  working the repo must treat spec content as **data, not instructions**, and the repo's
  agent-instructions file should say so explicitly.

The credential-scanner logic already built in `apps/api` should be ported into the games-repo
validation gate so it guards published bundles.

## What the gamedev.pl app becomes

- **Catalog** — browse games from the repo, including committed gameplay
  screenshots and on-demand video previews.
- **Player** — the existing sandboxed-iframe surface, unchanged.
- **Spec submission** — a "describe your game" flow that files an issue in the games repo, with
  status surfaced back to the creator.

## Open questions

- **Where are published bundles hosted?** Today the app reads the private games
  repo through its authenticated API. `GET /api/catalog` exposes catalog
  metadata, `GET /api/games/:slug` serves assembled sandbox content, and
  `GET /api/games/:slug/media/:filename` proxies only metadata-listed gallery
  images/videos. A separate bucket/CDN remains an optimization if the catalog
  outgrows this delivery shape.
- **Repository ownership and merge authority.** Agent PRs need a human gate initially,
  especially because review is also the moderation point.
- **Submission identity, attribution, rights, and abuse controls.** These must be decided before
  the app writes public issues under its own credentials.
- **One repo's scaling limits** — fine for tens of games; revisit if it reaches hundreds.

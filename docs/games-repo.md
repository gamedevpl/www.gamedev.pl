# The Games Repo — agent-maintained games

> **Status: ✅ Live.** The games repo is the repo lane's system of record (see
> [`architecture.md`](./architecture.md#two-catalog-lanes)) and this document supersedes the
> container-based generation architecture, which has been removed (see "Why this replaced the
> previous design" below). One part of the shape below is stale: work no longer reaches an
> agent by filing an issue (see the correction under "What the gamedev.pl app becomes"). A round
> is dispatched to an agent backend and delivered over the build channel — not via issue or PR —
> as described in [`architecture.md`](./architecture.md).

## The shape

Games live in a **dedicated games repository**, one monorepo for all of them. Each game is a
directory containing a **spec** (the source of truth) and its implementation:

```
games/
  dodge-the-rocks/
    SPEC.md          ← source of truth, including catalog frontmatter
    GAME.json        ← shared-engine module selection
    CAPTURE.json     ← deterministic play, assertion, and capture scenario
    game.ts          ← lean composition root
    game/
      model.ts
      runtime.ts
      render.ts      ← optional, for games with substantial rendering logic
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

The games repository contains TypeScript executable sources only. Game-local modules may import
other `.ts` files within their own game directory; package imports and cross-game imports are not
allowed. Its build tooling and this app's GitHub client bundle those module graphs into
dependency-free JavaScript before browser delivery.

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

### What was removed was compute we operate, not every hosted builder

Worth stating precisely, because "we removed hosted agent execution for legal reasons" is
easy to read as a ban on anything that runs an agent. The two findings were specific:

- **B0** existed because a container _of ours_ ran untrusted prompts next to a credential.
- **B1/B2** existed because that agent ran on a **subscription licensed to a human**, whose
  terms do not cover a service reselling it to third parties.

A backend on a hosted agent platform paid through a **metered first-party API key** meets
neither condition: we operate no sandbox, and an API key is sold for programmatic use
rather than seated to a person. That is why
[`managed-agent-backend.md`](./managed-agent-backend.md) can exist without reopening the
pivot. It does not make it a good idea — the cost case is a separate argument, and the
default platform builder is still Copilot dispatch — but the blocker is a property of
_who runs the compute and on whose licence_, not of hosted builders as a category.

## The product consequence: creation is asynchronous

This is the significant trade and it should be designed for, not discovered:

|                     | Old               | New                                                                               |
| ------------------- | ----------------- | --------------------------------------------------------------------------------- |
| **Playing** a game  | Instant           | **Instant** (static bundles)                                                      |
| **Creating** a game | ~30s, synchronous | **Asynchronous** — spec → agent round → build-channel delivery → gate → published |

Creation becomes closer to _commissioning_ a game than _generating_ one. The UI must set that
expectation honestly: submitted specs need visible status ("queued", "an agent is working on
it", "published"), and the catalog should be full enough that arriving users have something to
play immediately.

## Trust boundaries

Two remain, and they're simpler than before.

**1. Generated game code is still untrusted.** It's written by an agent, and later influenced
by creator specs and player remix requests. It runs in the player's browser, so the existing
invariant is unchanged and non-negotiable: `sandbox="allow-scripts allow-pointer-lock"` with **no
`allow-same-origin`** (see [`security-model.md`](./security-model.md)). Serving games from a
separate, cookieless origin remains the right call. Phone tilt (`GameKit.createSensing`) is
owned by the shell and relayed into the iframe over `gdp` — games never read
DeviceOrientation themselves. Tilt stays optional; keyboard / pad remain enough.

**2. Creator-submitted specs are untrusted input.** The app dispatches them to an agent backend
under our identity, which is content submission rather than compute-on-behalf — a much weaker
concern than the one we just removed, but not nothing:

- **Abuse/spam**: rate-limit submissions; don't let anyone flood the agent backend with rounds.
- **Moderation**: spec text lands in our submission store under our identity — the store lane
  never commits it to the (private) games repo at all; only repo-lane maintenance touches that
  repo. It needs review before, or shortly after, it appears.
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
- **Spec submission** — a "describe your game" flow that dispatches a round to an agent
  backend, with status surfaced back to the creator.

## Open questions

- ~~**Where are published bundles hosted?**~~ **Resolved: a Cloud Storage snapshot.**
  Merges to the games repo bake catalog, assembled HTML, and media into
  `gs://…-games-snapshots`. When `GAMES_SNAPSHOT_BUCKET` is set, the API serves
  published `GET /api/catalog`, `GET /api/games/:slug`, and media routes **only**
  from that snapshot — misses and Storage errors fail the request (503 / 502 /
  404 as appropriate); they do not assemble from GitHub. Unset the env var for
  local/dev. GitHub remains the source of truth for content (the bake reads it)
  and for PR / draft previews. The API remains the games origin — the bucket is
  not public. Details: [`games-snapshot.md`](./games-snapshot.md).
- **Repository ownership and merge authority.** Agent PRs need a human gate initially,
  especially because review is also the moderation point.
- **Submission identity, attribution, rights, and abuse controls.** These must be decided for
  specs the app dispatches to an agent backend under its own credentials.
- **One repo's scaling limits** — fine for tens of games; revisit if it reaches hundreds.

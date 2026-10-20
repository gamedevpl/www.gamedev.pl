# Product Vision

## The product

gamedev.pl is becoming a catalog and creation surface for AI-assisted browser games:

1. A creator describes a game as a structured, human-readable spec.
2. A coding agent implements it as real HTML/CSS/JS in a dedicated games repository.
3. A human reviews the spec and implementation together.
4. A publish workflow makes the game immediately playable from the catalog.
5. A creator can later propose changes to their own published game; an agent updates the
   spec and implementation, and a maintainer reviews before it republishes (no PR — see
   [`architecture.md`](./architecture.md)). Player remix was tried and removed (2026-10): editing someone else's game invites copying; players propose changes instead.

This is intentionally **not** real-time generation. Creation is closer to commissioning a
game: asynchronous, visible, and reviewable. (The local deterministic mock generator this
paragraph once pointed to as a demo is gone — `packages/game-generator` is not tracked in
git — superseded once real creation shipped; see [`architecture.md`](./architecture.md).)

Games are unconstrained code, so safety comes from sandboxed execution. Every game runs inside
an iframe with `sandbox="allow-scripts allow-pointer-lock"` and no `allow-same-origin`, and production games are
served from a separate cookieless origin.

## Visual identity

The new product inherits the established gamedev.pl identity from the legacy `master` branch:

| Token             | Value                                |
| ----------------- | ------------------------------------ |
| Header background | `#1d2123`                            |
| Accent            | `#00e4ac`                            |
| Body background   | `#454545`                            |
| Font              | Proxima Nova                         |
| Wordmark          | `gamedev.pl` with `.pl` in turquoise |

## The two core loops

### 1. Create ✅

```text
Creator submits a spec
        ↓
Moderation and quota, then the round is dispatched to an agent backend
        ↓
The agent delivers over the build channel (submit_sources) — not a merged PR
        ↓
A Cloud Build gate run checks the delivery
        ↓
An operator approves; publishing is a registry write
```

The creator sees honest asynchronous states such as submitted, under review, agent working,
gate running, and published. This loop always lands in the **store lane** — see
[`architecture.md`](./architecture.md#two-catalog-lanes) for the full flow and for how the
repo lane's older games differ.

### 2. Play ✅

```text
Player browses the published catalog
        ↓
The selected bundle loads from the games origin
        ↓
The game runs in the sandboxed iframe
```

Live in production. Both catalog lanes serve this loop; see
[`architecture.md`](./architecture.md#two-catalog-lanes).

A player who wants a change to someone else's game submits a text-only proposal (title + description) on games whose creator enabled proposals; accepting it
starts the creator's own agent round. See [`roadmap.md`](./roadmap.md#phase-4--player-remix-removed).

## Why one games repository

A shared repository makes the spec the durable source of truth and gives every coding agent
the same working contract. It provides normal diffs, review, CI, history, attribution, and
rollback without gamedev.pl operating agent compute or holding model credentials.

The tradeoff is asynchronous creation and a central moderation burden. The UI and operating
model must acknowledge both rather than presenting an instant-generation promise.

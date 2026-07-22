# Product Vision

## The product

gamedev.pl is becoming a catalog and creation surface for AI-assisted browser games:

1. A creator describes a game as a structured, human-readable spec.
2. A coding agent implements it as real HTML/CSS/JS in a dedicated games repository.
3. A human reviews the spec and implementation together.
4. A publish workflow makes the game immediately playable from the catalog.
5. Players can later propose changes that follow the same spec → PR → review path.

This is intentionally **not** real-time generation. Creation is closer to commissioning a
game: asynchronous, visible, and reviewable. The local deterministic generator remains a
useful player-surface demo, not the future production backend.

Games are unconstrained code, so safety comes from sandboxed execution. Every game runs inside
an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, and production games are
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

## The three core loops

### 1. Create 📋

```text
Creator submits a spec
        ↓
The app validates it and files a games-repo issue
        ↓
A coding agent proposes SPEC.md + implementation in a PR
        ↓
Human review and automated validation gate the merge
        ↓
The publish workflow adds the game to the catalog
```

The creator sees honest asynchronous states such as submitted, under review, agent working,
PR open, and published.

### 2. Play 📋 (player surface proven locally)

```text
Player browses the published catalog
        ↓
The selected bundle loads from the games origin
        ↓
The game runs in the sandboxed iframe
```

The existing mock proves the last step with three playable templates. Catalog ingestion and
published hosting are not built yet.

### 3. Remix 📋

```text
Player proposes a behavior change
        ↓
The request becomes a proposed spec change
        ↓
An agent updates the spec and implementation in a PR
        ↓
Maintainers review; the agent never auto-merges
        ↓
Merge republishes the game
```

## Why one games repository

A shared repository makes the spec the durable source of truth and gives every coding agent
the same working contract. It provides normal diffs, review, CI, history, attribution, and
rollback without gamedev.pl operating agent compute or holding model credentials.

The tradeoff is asynchronous creation and a central moderation burden. The UI and operating
model must acknowledge both rather than presenting an instant-generation promise.

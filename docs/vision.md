# Product Vision

## The pivot

gamedev.pl began as a static site of hand-built, open-source browser games (React + TS +
Canvas). Those games — `tribe2`, `tribe`, `masterplan`, `hungry-lion`, and others — still
live on the `master` branch and remain the source of the project's visual identity.

The new direction is a **SaaS for AI-created games**:

1. A **creator** describes a game in plain language.
2. An **AI agent builds it as real, runnable code** — not a constrained template document,
   but an actual self-contained HTML/JS/CSS game.
3. The game is **immediately playable in the browser**.
4. **Players** can play games made by other creators, and eventually request changes that
   an agent turns into a pull request for the creator to review.

The differentiator is that generation produces _real code_ rather than filling slots in a
fixed DSL. Because arbitrary generated code cannot be schema-validated for safety, the
safety model is **sandboxed execution**: every generated game runs inside an iframe with
`sandbox="allow-scripts"` and **no** `allow-same-origin`, so it cannot reach the parent
page, cookies, or same-origin storage.

## Visual identity (inherited from `master`)

| Token             | Value                                             |
| ----------------- | ------------------------------------------------- |
| Header background | `#1d2123` (dark)                                  |
| Accent            | `#00e4ac` (turquoise)                             |
| Body background   | `#454545`                                         |
| Font              | Proxima Nova                                      |
| Wordmark          | `gamedev.pl` with **`.pl`** rendered in turquoise |

Keep new UI consistent with this identity.

## The three core loops

### 1. Create loop ✅ (mock) / 🚧 (real generation planned)

The heart of the product. Today it runs end-to-end with a deterministic mock generator.

```
Creator writes a prompt
        │
        ▼
Frontend POSTs the prompt to the API
        │
        ▼
Generator produces a real self-contained game (HTML + JS + CSS)
        │
        ▼
The game is assembled into one document and rendered in a sandboxed iframe
        │
        ▼
Creator plays it instantly; iterates on the prompt
```

Future: the generator becomes a real agentic coding CLI (Claude Code / Codex / "agy") run
inside an ephemeral container against a game-template repo, instead of a mock.

### 2. Play loop 📋 (multi-creator not built)

Once games are persisted and attributable to creators, any player can browse and play games
made by others. The play surface is the same sandboxed iframe used in the create loop, so
the safety guarantees are identical whether you are playing your own game or someone else's.

```
Player opens a creator's game
        │
        ▼
The stored game bundle is served and rendered in a sandboxed iframe
        │
        ▼
Player plays; optionally requests a change (→ remix loop)
```

### 3. Remix loop 📋 (not built)

The growth flywheel. While playing a game, a player can request a change in plain language.
An agent makes the change and **opens a pull request** against the original creator's
repository — it does **not** auto-merge. The creator reviews and merges through normal
GitHub review. This preserves the trust boundary: nobody's code is changed without the
owner's approval.

```
Player requests a change while playing
        │
        ▼
An agent produces a diff against the creator's game repo
        │
        ▼
The agent opens a PULL REQUEST (never auto-merges)
        │
        ▼
Creator reviews & merges via GitHub → the game updates
```

See [`remix-to-pr.md`](./remix-to-pr.md) for the full spec.

## Why GitHub is central (future)

The long-term plan uses GitHub as a growth engine: each creator's game lives in a real
GitHub repository, built from a public game-template repo, with a "publish" GitHub Action
that pushes the static bundle to gamedev.pl. This makes games hackable by Copilot, Claude
Code, Codex, and humans alike, and makes the remix→PR loop a natural fit for how developers
already collaborate.

> These future milestones are directional, not committed. See [`roadmap.md`](./roadmap.md)
> and [`risks-and-open-questions.md`](./risks-and-open-questions.md).

# Agent progress notes

> **Audience:** the coding agent building a game in `gamedevpl/www.gamedev.pl-games`.
> Drop this into that repo (as a skill, or a section of its `AGENTS.md` /
> `.github/copilot-instructions.md`) — the web app reads the file it describes.

## Why

While an agent builds a game, the creator watches a live status page on www.gamedev.pl. Until
now, everything on that page was **inferred**: commit subjects, the PR checklist, timestamps. A
creator got "fix: harden mission indexing and fallback brief" and had to guess what it meant for
their game — and between two commits, the page had nothing to say at all.

A one-line journal, committed as you work, replaces all of that inference with the agent's own
words. The web app shows the newest line verbatim, above everything else, translated into the
creator's language.

## The contract

Keep a **newest-first** journal at `games/<slug>/PROGRESS.md` on your working branch:

```markdown
# Progress

- Adding grenades to the soldiers.
- Made the squad move faster after the creator asked.
- Got the squad moving and shooting on the first mission.
```

- **The top entry is what the creator sees.** Everything below it is history for the PR.
- Write it **before or as you start** a step, not after — the point is to answer "what is
  happening right now?".
- **Commit it immediately**, on its own if need be (`chore: progress note`). A tiny extra commit
  is far cheaper than a creator staring at a page that hasn't moved in ten minutes.
- **One plain sentence**, about the game, in the words a player would use. No file names, no
  module names, no conventional-commit prefixes.
- A leading ISO timestamp (`- 2026-07-24T20:31:00Z — Adding grenades.`) is allowed and stripped
  before display, so use one if it helps you keep order.

## What the app does with it

- Reads `games/<slug>/PROGRESS.md` from your PR's head branch on every status poll (cached ~60s).
- Takes the first line with content, strips the bullet and any timestamp, sanitizes it as
  untrusted text, caps it at 300 characters, and translates it into the creator's language.
- Renders it at the top of the build panel as "Agent says: …".
- Falls back to the old behaviour (first unfinished checklist item + commit log) when the file is
  missing — so not keeping the journal degrades, it doesn't break.

## Still do the rest

The journal replaces guesswork, not the other signals:

- Open the PR as a **draft early**, before the game is playable.
- Keep the **task checklist** (`- [ ]` / `- [x]`) in the PR body ticked as you go.
- Commit in **small steps**, with subjects about the game rather than the code.

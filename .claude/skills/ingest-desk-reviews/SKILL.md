---
name: ingest-desk-reviews
description: Export www.gamedev.pl /review desk outcomes and sync them into www.gamedev.pl-games game-assessment issues for coding agents. Use when an operator finishes a review sweep, wants a synthesis/plan for catalog fixes, or needs to hand keep/cut checklist signal to games-repo agents.
---

# Ingest editorial desk reviews → games repo

The `/review` desk stores keep/cut/skip + checklist + notes in Firestore
(`gameAssessments/{slug}:{reviewerUid}`). Coding agents that maintain catalog games work
in **`www.gamedev.pl-games`**, not against Firestore. The bridge is GitHub issues labeled
`game-assessment`, with a synced **Editorial desk review** section.

## Why issues (not a second store)

- Games-repo agents already open `game-assessment` tickets for the automated floor.
- Issues are assignable, searchable, and visible to Copilot without admin API access.
- PATs cannot call `/api/admin/*` (`isAdminSession` is browser-session only) — so agents
  cannot pull assessments themselves. An operator export + sync is the intentional gate.

Raw notes may live on the **private** games-repo issue as evidence. Agents must still
paraphrase them into plans (same "aggregates leave the building" spirit as player
feedback — see `docs/game-assessment-plan.md`).

## Operator steps

1. Finish or pause a review sweep on **Admin → Assessments**.
2. Click **Download JSON** (same payload as `GET /api/admin/assessments`).
   Or with a signed-in admin session cookie:

```bash
curl -sS -b cookies.txt https://www.gamedev.pl/api/admin/assessments -o assessments.json
```

3. In a checkout of `www.gamedev.pl-games`:

```bash
# Ensure per-game tickets exist (idempotent).
node --import tsx .github/scripts/create-assessment-issues.ts

# Upsert desk sections + label desk-reviewed.
GITHUB_TOKEN=… GITHUB_REPOSITORY=gamedevpl/www.gamedev.pl-games \
  node --import tsx .github/scripts/sync-desk-reviews.ts --from assessments.json
```

4. Triage issues with `label:desk-reviewed` (cuts and weak axes first). Assign a coding
   agent only after you want work; the sync never auto-dispatches.

## Synthesis without syncing (optional)

If you only need a one-shot plan, feed the JSON to an agent with this prompt shape:

- Group by slug; report keep/cut/skip counts and weak/bad checklist axes.
- Paraphrase note themes (≤3 bullets per slug); never quote long raw notes in public
  PRs for the product repo.
- Propose keep / polish / rework / delist — human decides.

Prefer writing that plan onto the games-repo issue (via the sync script) so the next
agent finds it without re-exporting.

## Games-repo skill (agents building games)

Read and follow
[`www.gamedev.pl-games/.github/skills/ingest-desk-reviews/SKILL.md`](https://github.com/gamedevpl/www.gamedev.pl-games/blob/main/.github/skills/ingest-desk-reviews/SKILL.md)
when improving a catalog game that already has desk verdicts.

## Product follow-ups (not this skill)

- Nightly/operator-button sync from Cloud Run with the games-repo token (still human
  approve before assign).
- Improvement-loop signal class from cut consensus (aggregates only, never raw notes).

Self-improvement clause: if this skill is wrong, stale, or missing something that cost
you time, update it in the same session.

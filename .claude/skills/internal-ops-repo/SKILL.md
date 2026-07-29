---
name: internal-ops-repo
description: The private www.gamedev.pl-ops repo holds the internal docs that no longer live in this public repo — GTM/go-to-market strategy, the risk register (risks-and-open-questions), legal compliance analysis, store account checklists, operational readiness plans, and the creator-experience review. Use whenever work touches planning, prioritisation, launch stages, legal/compliance, store submission, ops/monitoring gates, or product risks — or whenever a doc referenced somewhere cannot be found in docs/. Also covers the rules for not leaking private content into this public repo.
---

# The private ops repo (`www.gamedev.pl-ops`)

gamedev.pl splits across three repos:

| Repo                                                                        | Visibility  | What it holds                                                       |
| --------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| [`www.gamedev.pl`](https://github.com/gamedevpl/www.gamedev.pl)             | **public**  | The product: app, API, infra scripts, architecture and feature docs |
| [`www.gamedev.pl-games`](https://github.com/gamedevpl/www.gamedev.pl-games) | private     | Agent-maintained games content                                      |
| [`www.gamedev.pl-ops`](https://github.com/gamedevpl/www.gamedev.pl-ops)     | **private** | Internal docs: strategy, risks, legal, ops — **important context**  |

## What lives in the ops repo

Moved out of this repo's `docs/` in 2026-07 (old revisions remain in public git history —
accepted; future edits happen there):

- `docs/gtm-plan.md` — go-to-market stages and gates. Code comments in
  `creator-metrics.ts`, `visit-funnel.ts`, `CreatorMetricsPanel.tsx` refer to it.
- `docs/risks-and-open-questions.md` — the risk register and resolved-decisions log.
- `docs/legal-compliance-plan.md` — RODO/UŚUDE/DSA/AI-Act analysis behind the published
  legal pages.
- `docs/operational-readiness-plan.md` — backup/monitoring/observability gates per GTM
  stage.
- `docs/store-accounts-setup.md` — owner checklist for Apple/Play accounts and keys.
- `docs/creator-experience-review.md` — internal critique of the creation flow.

Start at its [`docs/README.md`](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/README.md);
its `AGENTS.md` is the contract for working there.

## When you MUST consult it

Before making or revising decisions about: launch/beta stages and what gates them, pricing
or growth, legal or moderation obligations, store submission, monitoring/backup priorities,
or anything the risk register may already have resolved. These topics are deliberately
undocumented in the public repo — absence of a public doc is not absence of a decision.

## Getting access

- Claude Code remote sessions: the repo may already be in scope (check
  `/home/user/www.gamedev.pl-ops`); otherwise attach it with `add_repo`
  (`gamedevpl/www.gamedev.pl-ops`).
- Local sessions: clone it next to this repo.
- **GitHub Copilot's coding agent has no access.** Never assign it a task whose spec
  depends on ops-repo content; inline the minimum needed detail instead (without leaking
  anything sensitive).

## Leak hygiene (non-negotiable)

- Never copy ops-repo content into this repo, public issues, PR descriptions, commit
  messages, or code comments. Linking/naming a doc is fine — quoting it is not.
- When an ops-repo doc and public code drift apart, update the ops repo in the same
  session (its `AGENTS.md` self-improvement clause).
- Secrets never go in either repo — Secret Manager / Actions secrets only.

## Self-improvement clause

If this skill is wrong, stale, or missing something that cost you time (e.g. a doc moved
again, access steps changed), update it in the same session.

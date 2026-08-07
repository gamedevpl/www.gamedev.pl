# Game assessment desk — reviewer swipe reviews

> Status: ✅ **Steel thread shipped** — a `reviewer` allowlist, `/review` swipe desk
> (catalog + shared creator drafts), text/speech rationale, and an operator summary.
> First drafted 2026-08-06.

## Why

Closed beta needs a fast way for a trusted colleague to walk the catalog (and shared
creator drafts), say keep or cut, and leave a short reason — preferably by speaking,
not typing. Player votes and scorecards measure _play_; this measures _editorial
judgment_ from someone who knows what the shelf should feel like.

## Shape

| Piece         | Choice                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Role          | Env allowlist `REVIEWER_UIDS` (comma UIDs). Admins are reviewers too. Session-only, same posture as `ADMIN_UIDS` — PATs never count. |
| Surface       | Unlisted `/review`. 404 to everyone else (API answers 404, not 403).                                                                 |
| Queue         | **Catalog** (published) and **Creator** (delivered, shared drafts that are not yet published). Private unshared drafts stay private. |
| Gesture       | Swipe right = keep, left = cut, down/button = skip. Keyboard: `→` / `←` / `↓`.                                                       |
| Preview       | Catalog **MP4 + screenshots** first (gate media). Optional **Try play** mounts the sandboxed game without play telemetry.            |
| Mobile dock   | Note + Cut/Skip/Keep sit in a **sticky bottom dock** (thumb zone). Install/update banners lift the dock via `:has(...)`.             |
| Rationale     | **Required** free text and/or speech-to-text (same Web Speech API as the hero mic). Transcript only — no audio upload.               |
| Checklist     | Required marks for **graphics / gameplay / fun / sound / controls** — each `ok` · `weak` · `bad`.                                    |
| Client env    | Viewport, screen size, DPR, input method (`touch`/`mouse`/`mixed`), platform, lang, truncated UA — stored on the row at commit time. |
| Storage       | `gameAssessments/{slug}:{reviewerUid}` — one row per reviewer per game; a second pass overwrites.                                    |
| Operator read | `/admin/assessments` — **review sweeps** (dispatch / rate / pause / notify) plus keep/cut aggregates and recent notes.               |
| Sweeps        | Operator opens a bounded pass; desk shows only the released prefix. `releasePerDay` drips by 24h from `startedAt`; manual Release.   |
| Notify        | Starting or re-notifying a sweep fans out `operator.review_sweep` to `REVIEWER_UIDS` ∪ admins (in-app + email + push).               |

## Non-goals (this steel thread)

- Auto-unpublishing or auto-filing issues from a cut — the desk records judgment; acting
  on it stays a human operator decision. **Manual** sync into games-repo
  `game-assessment` issues (label `desk-reviewed`) is the supported handoff — see
  [`.claude/skills/ingest-desk-reviews/SKILL.md`](../.claude/skills/ingest-desk-reviews/SKILL.md).
- Star ratings or free-form rubrics beyond the fixed five-axis checklist.
- Granting reviewers access to _private_ (unshared) creator drafts.
- Feeding raw assessment notes into agent prompts — same "aggregates leave the building"
  rule as player feedback until a later IL phase deliberately opts in. Synced issue
  evidence is for paraphrased plans only.

## Auth contract

Mirror the operator console:

1. Client learns `user.reviewer === true` from the session payload (hint only).
2. Every `/api/review/*` route re-checks `isReviewerSession` (browser session ∩
   (`REVIEWER_UIDS` ∪ `ADMIN_UIDS`)).
3. Non-reviewers get **404**.

## Managing reviewers

Same shape as `ADMIN_UIDS` — a **GitHub repository variable**, not a Firestore CLI like
`beta:approve`. Hand-editing Cloud Run env is wiped on the next deploy
([runbooks/README.md](./runbooks/README.md) — "Runtime levers").

1. Colleague must already be on the closed beta (waitlist approved / allowlist).
2. Find their uid (`g:<google-sub>`):
   - Operator console → Waitlist (approved row), or
   - Firestore `waitlist` where `email == …`, or
   - Ask them to open `/api/auth/me` while signed in.
3. Set / update the durable variable and redeploy:

```bash
# Read current value, then append the new uid (comma-separated, no spaces).
gh variable get REVIEWER_UIDS
gh variable set REVIEWER_UIDS --body "g:111...,g:222..."

# Either path threads the var into Cloud Run:
gh workflow run deploy.yml
# or: REVIEWER_UIDS='g:111...,g:222...' ./infra/deploy-api.sh
```

4. After the revision is live they see **Review** in the hamburger and can open `/review`.
   The desk stays empty until an operator starts a **review sweep** on Assessments.

Admins are reviewers automatically — do not duplicate their uids in `REVIEWER_UIDS`.
Unset / empty means nobody extra is a reviewer. Locally: `REVIEWER_UIDS=dev:local`
(or pass `reviewerUids` into `buildApp` in tests).

## API

| Method | Path                                             | Who      | Body / query                                                                                      |
| ------ | ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/review/queue?source=catalog\|creator\|all` | reviewer | Queue of games not yet assessed by this reviewer                                                  |
| `POST` | `/api/review/assessments`                        | reviewer | `{ slug, source, title?, creatorHandle?, verdict, note, checklist, noteOrigin?, clientContext? }` |
| `GET`  | `/api/review/assessments/mine`                   | reviewer | This reviewer's rows (progress / re-edit)                                                         |
| `GET`  | `/api/admin/assessments`                         | admin    | Aggregate + recent rows for the operator tab                                                      |
| `GET`  | `/api/admin/review-sweeps`                       | admin    | Open sweep + progress + recent history                                                            |
| `POST` | `/api/admin/review-sweeps`                       | admin    | Start a sweep (`source`, `maxGames`, `releasePerDay?`, `note?`, `notify?`)                        |
| `POST` | `/api/admin/review-sweeps/:id`                   | admin    | Pause / resume / complete / cancel, release more/all, change rate, notify again                   |

The desk queue is **empty until an operator opens a sweep**. Released games unlock by
`releasePerDay` (elapsed 24h windows from `startedAt`) and/or manual Release controls.
Every **new** verdict must target a slug in the active released prefix (re-edits of an
existing assessment are allowed). Every verdict (including `skip`) needs a **non-empty
note** and a complete checklist (`graphics` / `gameplay` / `fun` / `sound` / `controls`,
each `ok|weak|bad`). Notes are moderated and sanitized.

## Instrumentation

This is an **operator workflow**, not a player funnel. It does not join the visit or
play streams (those stay unattributable). Progress is the assessment collection itself:
how many keep/cut/skip, how many games still unassessed. Visit telemetry folds `/review`
into the existing `health` bucket (same unlisted-console posture as `/admin`).

## Follow-ups (not blocking)

- Re-queue a game after a major revision (invalidate assessments when `publishedAt` or
  delivered version advances).
- Optional export / CSV for offline curation sessions — **JSON download** on Admin →
  Assessments is the first cut; feed it to
  `www.gamedev.pl-games` `.github/scripts/sync-desk-reviews.ts`.
- Tie cut consensus into the improvement-loop suggestion router as a _signal class_,
  never as raw note text.
- Operator-triggered Cloud Run → games-repo sync (still no auto-assign).
- **Reviewer-captured clip attached to an assessment.** The live game runs in a sandboxed
  iframe with no `allow-same-origin`, so the parent page cannot call
  `canvas.captureStream()` / `MediaRecorder` on the game. A PNG still is already possible
  via the playtest bridge (`capturePng` in `gamePlayer.ts`). A reviewer video would need
  either a bridge-exported stream from the game document or a server-side capture — not
  the catalog MP4, which is already shown on the desk.

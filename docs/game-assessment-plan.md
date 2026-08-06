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
| Rationale     | Free text and/or browser speech-to-text (same Web Speech API as the hero mic). Only the transcript is stored — no audio upload.      |
| Client env    | Viewport, screen size, DPR, input method (`touch`/`mouse`/`mixed`), platform, lang, truncated UA — stored on the row at commit time. |
| Storage       | `gameAssessments/{slug}:{reviewerUid}` — one row per reviewer per game; a second pass overwrites.                                    |
| Operator read | `/admin/assessments` — **review sweeps** (dispatch / rate / pause / notify) plus keep/cut aggregates and recent notes.               |
| Sweeps        | Operator opens a bounded pass; desk shows only the released prefix. `releasePerDay` drips more; manual Release more / all.           |
| Notify        | Starting or re-notifying a sweep fans out `operator.review_sweep` to `REVIEWER_UIDS` ∪ admins (in-app + email + push).               |

## Non-goals (this steel thread)

- Auto-unpublishing or auto-filing issues from a cut — the desk records judgment; acting
  on it stays a human operator decision.
- Scoring rubrics, star ratings, or multi-axis forms — one verdict + one note.
- Granting reviewers access to _private_ (unshared) creator drafts.
- Feeding raw assessment notes into agent prompts — same "aggregates leave the building"
  rule as player feedback until a later IL phase deliberately opts in.

## Auth contract

Mirror the operator console:

1. Client learns `user.reviewer === true` from the session payload (hint only).
2. Every `/api/review/*` route re-checks `isReviewerSession` (browser session ∩
   (`REVIEWER_UIDS` ∪ `ADMIN_UIDS`)).
3. Non-reviewers get **404**.

Grant access by adding a colleague's uid to `REVIEWER_UIDS` on the Cloud Run service
(and ensuring they are already on the closed-beta allowlist / waitlist). Locally:
`REVIEWER_UIDS=dev:local` (or pass `reviewerUids` into `buildApp` in tests).

## API

| Method | Path                                             | Who      | Body / query                                                                            |
| ------ | ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| `GET`  | `/api/review/queue?source=catalog\|creator\|all` | reviewer | Queue of games not yet assessed by this reviewer                                        |
| `POST` | `/api/review/assessments`                        | reviewer | `{ slug, source, title?, creatorHandle?, verdict, note?, noteOrigin?, clientContext? }` |
| `GET`  | `/api/review/assessments/mine`                   | reviewer | This reviewer's rows (progress / re-edit)                                               |
| `GET`  | `/api/admin/assessments`                         | admin    | Aggregate + recent rows for the operator tab                                            |
| `GET`  | `/api/admin/review-sweeps`                       | admin    | Open sweep + progress + recent history                                                  |
| `POST` | `/api/admin/review-sweeps`                       | admin    | Start a sweep (`source`, `maxGames`, `releasePerDay?`, `note?`, `notify?`)              |
| `POST` | `/api/admin/review-sweeps/:id`                   | admin    | Pause / resume / complete / cancel, release more/all, change rate, notify again         |

The desk queue is **empty until an operator opens a sweep**. Released games unlock by
`releasePerDay` (UTC drip) and/or manual Release controls. Notes are moderated and
sanitized when non-empty. `skip` and empty notes are allowed so a fast pass is not
blocked on writing.

## Instrumentation

This is an **operator workflow**, not a player funnel. It does not join the visit or
play streams (those stay unattributable). Progress is the assessment collection itself:
how many keep/cut/skip, how many games still unassessed. Visit telemetry folds `/review`
into the existing `health` bucket (same unlisted-console posture as `/admin`).

## Follow-ups (not blocking)

- Re-queue a game after a major revision (invalidate assessments when `publishedAt` or
  delivered version advances).
- Optional export / CSV for offline curation sessions.
- Tie cut consensus into the improvement-loop suggestion router as a _signal class_,
  never as raw note text.
- **Reviewer-captured clip attached to an assessment.** The live game runs in a sandboxed
  iframe with no `allow-same-origin`, so the parent page cannot call
  `canvas.captureStream()` / `MediaRecorder` on the game. A PNG still is already possible
  via the playtest bridge (`capturePng` in `gamePlayer.ts`). A reviewer video would need
  either a bridge-exported stream from the game document or a server-side capture — not
  the catalog MP4, which is already shown on the desk.

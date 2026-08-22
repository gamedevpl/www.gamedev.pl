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

| Piece              | Choice                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role               | Env allowlist `REVIEWER_UIDS` (comma UIDs). Admins are reviewers too. Session-only, same posture as `ADMIN_UIDS` — PATs never count.                                                |
| Surface            | Unlisted `/review`. 404 to everyone else (API answers 404, not 403).                                                                                                                |
| Queue              | **Catalog** (published) and **Creator** (delivered, shared drafts that are not yet published). Private unshared drafts stay private.                                                |
| Gesture            | Swipe right = keep, left = cut, down/button = skip. Keyboard: `→` / `←` / `↓`.                                                                                                      |
| Preview            | Catalog **MP4 + screenshots** first (gate media). Optional **Try play** opens full-screen theater (no play telemetry, no remix).                                                    |
| Mobile dock        | Note + Cut/Skip/Keep sit in a **bottom dock** (thumb zone). The desk owns the window like Studio; install/update banners join the column instead of covering the game.              |
| Rationale          | **Required** free text and/or speech-to-text (same Web Speech API as the hero mic). Transcript only — no audio upload.                                                              |
| Checklist          | Required marks for **graphics / gameplay / fun / sound / controls** — each `ok` · `weak` · `bad`.                                                                                   |
| Client env         | Viewport, screen size, DPR, input method (`touch`/`mouse`/`mixed`), platform, lang, truncated UA — stored on the row at commit time.                                                |
| Storage            | `gameAssessments/{slug}:{reviewerUid}` — one row per reviewer per game; a second pass archives the prior row to `gameAssessmentHistory` before overwriting.                         |
| Resolution         | Operator marks a verdict **addressed** / **won't fix** / **deferred** with a required comment (and optional link). Stored on the row; a fresh reviewer pass clears it into history. |
| Operator read      | `/admin/assessments` — **review sweeps** (dispatch / rate / pause / notify) plus keep/cut aggregates and recent notes.                                                              |
| Sweeps             | Operator opens a bounded pass; desk shows only the released prefix. `releasePerDay` drips by 24h from `startedAt`; manual Release.                                                  |
| Targeted re-review | Operator picks explicit `slugs` × `reviewerUids` (`reviewReRequests/{slug}:{reviewerUid}`) to re-surface a slug for one reviewer outside any sweep — see below.                     |
| Notify             | Starting or re-notifying a sweep, or a targeted re-review, fans out `operator.review_sweep` to the intended reviewers (in-app + email + push).                                      |

## Non-goals (this steel thread)

- Auto-unpublishing or auto-filing issues from a cut — the desk records judgment; acting
  on it stays a human operator decision. Handoff is **Copy JSON** on Admin → Assessments
  into a coding-agent chat — see
  [`.claude/skills/ingest-desk-reviews/SKILL.md`](../.claude/skills/ingest-desk-reviews/SKILL.md).
- Star ratings or free-form rubrics beyond the fixed five-axis checklist.
- Granting reviewers access to _private_ (unshared) creator drafts.
- Feeding raw assessment notes into agent prompts — same "aggregates leave the building"
  rule as player feedback until a later IL phase deliberately opts in. Paste JSON is for
  paraphrased plans only.

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

| Method | Path                                                | Who      | Body / query                                                                                                                   |
| ------ | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/review/queue?source=catalog\|creator\|all`    | reviewer | Queue of games not yet assessed by this reviewer, plus any slug an operator has targeted for this reviewer to re-review        |
| `POST` | `/api/review/assessments`                           | reviewer | `{ slug, source, title?, creatorHandle?, verdict, note, checklist, noteOrigin?, clientContext?, gameVersion? }`                |
| `GET`  | `/api/review/assessments/mine`                      | reviewer | This reviewer's rows (progress / re-edit)                                                                                      |
| `GET`  | `/api/admin/assessments?offset=&limit=&resolution=` | admin    | Aggregate + paginated detailed rows (`limit` defaults to 40, max 200; follow `nextOffset`). `resolution=all\|open\|resolved`   |
| `POST` | `/api/admin/assessments/resolve`                    | admin    | `{ slug, reviewerUid?, status, comment, link? }` — record what was done about a verdict; `status: null` withdraws it           |
| `GET`  | `/api/admin/assessments/history?slug=&reviewerUid=` | admin    | The superseded rows a re-assessment would otherwise have overwritten silently                                                  |
| `GET`  | `/api/admin/review-sweeps`                          | admin    | Open sweep + progress + recent history                                                                                         |
| `POST` | `/api/admin/review-sweeps`                          | admin    | Start a sweep (`source`, `maxGames`, `releasePerDay?`, `note?`, `notify?`)                                                     |
| `POST` | `/api/admin/review-sweeps/:id`                      | admin    | Pause / resume / complete / cancel, release more/all, change rate, notify again                                                |
| `POST` | `/api/admin/review-requeue`                         | admin    | `{ slugs[], reviewerUids[], gameVersion?, reason?, notify? }` — target explicit games at explicit reviewers, outside any sweep |
| `GET`  | `/api/admin/review-requeue`                         | admin    | Recent targeted re-review requests                                                                                             |

The operator tab fetches every detailed assessment page before **Copy JSON**, while showing
only the newest 40 rows on screen. The exported `{ total, games, recent }` shape stays stable.

The desk queue is **empty until an operator opens a sweep**, except for slugs an operator
explicitly targeted (see below), which surface regardless of any sweep. Released games
unlock by `releasePerDay` (elapsed 24h windows from `startedAt`) and/or manual Release
controls. Every **new** verdict must target a slug in the active released prefix, or one
of this reviewer's open targeted re-review requests (re-edits of an existing assessment
are always allowed). Every verdict (including `skip`) needs a **non-empty note** and a
complete checklist (`graphics` / `gameplay` / `fun` / `sound` / `controls`, each
`ok|weak|bad`). Notes are moderated and sanitized.

### Targeted re-review

`POST /api/admin/review-requeue` closes the gap the games-repo `catalog-feedback-loop`
skill used to call out: `/api/review/queue` excludes a slug a reviewer has already
assessed **permanently**, which is fine for a first pass but wrong once a fix has landed.
An operator names explicit `slugs` × explicit `reviewerUids` (bounded to 200 pairs) and
optionally the `gameVersion` the fix is expected to be judged against and a `reason`; each
pair opens (or re-opens) a `ReReviewRequest`. Only that reviewer sees that slug surface
again — the general sweep pool and every other reviewer are unaffected. The reviewer's
next verdict on that slug resolves the request and stamps the assessment's `gameVersion`
(from the submission if given, else the request's) so a later look can tell "judged this
exact build" apart from "judged an older one." The **previous** assessment is archived,
not overwritten — `GET /api/admin/assessments/history` reads it back — so the record of
what a reviewer said the first time survives a second pass. `gameVersion` is informational
only for the catalog (not tracked per-commit today); creator drafts pass their
`deliveredVersion`.

### Resolving an assessment

The desk records judgment; **resolution** records the response to it. Once we started
acting on reviews, "was this dealt with, and how?" had nowhere to live — a second reader
could not tell an untouched cut from one we had deliberately decided to keep as-is.

`POST /api/admin/assessments/resolve` writes a `resolution` onto the assessment row:

| Field        | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `status`     | `addressed` (a change landed) · `wont_fix` (deliberate no) · `deferred`      |
| `comment`    | **Required.** What was done, in the operator's words. Sanitized, ≤2000 chars |
| `link`       | Optional PR / commit / issue. Free text, not a validated URL                 |
| `resolvedAt` | Server timestamp                                                             |
| `resolvedBy` | Operator uid                                                                 |

Naming a `reviewerUid` resolves that one row; omitting it resolves **every reviewer's row
for the slug**, which is the usual shape — one fix answers the whole game's feedback.
`status: null` withdraws a resolution filed by mistake.

A resolution is a statement about **that verdict**, so the write is pinned to the verdict
generation it answers. `expectedUpdatedAt` (the row's `updatedAt` as the operator read it)
is checked inside a Firestore transaction; a verdict that landed in between is refused with
**409 `stale_verdict`** rather than inheriting a rationale written about the old one. The
whole-slug path pins each row to the version it just listed and reports skipped reviewers
in `stale`. The console sends the version it rendered and asks the operator to reload.

For the same reason a fresh reviewer pass clears the resolution:
the archived history row keeps the old resolution, and the new verdict starts open. Use
targeted re-review to ask a reviewer to look again after a fix; the two compose — requeue,
then resolve once the new verdict comes back.

Admin → Assessments shows resolved/open per game, an **unresolved only** filter on the
recent rows, and the resolve form itself. `Copy JSON` carries `resolved` / `open` totals
and each row's `resolution`, so an agent reading the export can skip what was handled.

### Operator CLI

The browser console is one path; `apps/api/scripts/assessments.ts` is the other, for an
operator (or a script) with gcloud credentials and no session — same shape as
`beta:approve` and `token:mint`, and the same reason: admin routes need a browser session,
which a terminal does not have.

```bash
npm run assess:list      -w @gamedevpl/api -- --open --limit 20
npm run assess:list      -w @gamedevpl/api -- --slug sky-dodge --json
npm run assess:show      -w @gamedevpl/api -- sky-dodge
npm run assess:resolve   -w @gamedevpl/api -- sky-dodge --status addressed \
                            --comment "Rebuilt the touch controls." --link "<PR url>"
npm run assess:resolve   -w @gamedevpl/api -- sky-dodge --reviewer g:alice --status wont_fix \
                            --comment "Pacing is the point of this one." --dry-run
npm run assess:unresolve -w @gamedevpl/api -- sky-dodge --reviewer g:alice
```

`list` filters by `--slug` / `--reviewer` / `--verdict` / `--open` / `--resolved`, and
`--json` gives the same rows the console exports. `show` prints one game in full: every
reviewer's verdict, checklist, note, follow-up, and the superseded rows behind it.
`resolve` without `--reviewer` covers every reviewer's row for the slug; `--dry-run` says
what it would touch and writes nothing.

Both paths call `prepareResolution` + `applyResolution`, so the required comment, the
sanitizing and the stale-verdict refusal cannot drift between console and terminal. A CLI
write is attributed as `cli:$USER` — deliberately not shaped like a uid, because the
operator authenticated to Google Cloud, not to the app. It writes to whatever project the
ambient credentials point at, so check `gcloud config get-value project` first.

Sweeps and targeted re-review stay in the console: both fan out notifications, which a
terminal has no business firing by accident.

## Instrumentation

This is an **operator workflow**, not a player funnel. It does not join the visit or
play streams (those stay unattributable). Progress is the assessment collection itself:
how many keep/cut/skip, how many games still unassessed. Visit telemetry folds `/review`
into the existing `health` bucket (same unlisted-console posture as `/admin`).

## Follow-ups (not blocking)

- ✅ **Targeted re-review** — `POST /api/admin/review-requeue` re-queues explicit slugs for
  explicit reviewers after a fix, independent of the general sweep exclusion. See "Targeted
  re-review" above. Still open: nothing _automatically_ invalidates an assessment when
  `publishedAt` or `deliveredVersion` advances — an operator (or a script driving the API)
  decides when a fix is worth a re-look and requeues it deliberately.
- ✅ **Resolution** — an operator records what was done about a verdict, and how; see
  "Resolving an assessment" above. Still open: nothing links a resolution to the games-repo
  commit automatically, and nothing nags about long-open cuts.
- Optional CSV for offline curation — **Copy JSON** on Admin → Assessments is enough for
  agent paste handoff ([`ingest-desk-reviews`](../.claude/skills/ingest-desk-reviews/SKILL.md)).
- ✅ **Editorial signal class** — creator-source cut consensus (≥2 reviewers, cut ≥ keep)
  persists an `editorial` Studio suggestion via the nightly suggestion sweep
  (`editorial-suggestions.ts`). Checklist weak/bad facets as metrics only; **never**
  reviewer notes. Catalog assessments stay operator-only. Play defect/friction wins over
  editorial for the same slug. Never autonomous.
- **Reviewer-captured clip attached to an assessment.** The live game runs in a sandboxed
  iframe with no `allow-same-origin`, so the parent page cannot call
  `canvas.captureStream()` / `MediaRecorder` on the game. A PNG still is already possible
  via the playtest bridge (`capturePng` in `gamePlayer.ts`). A reviewer video would need
  either a bridge-exported stream from the game document or a server-side capture — not
  the catalog MP4, which is already shown on the desk.

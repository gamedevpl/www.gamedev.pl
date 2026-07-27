# Published-game snapshots

**Status: ✅ built.** Serving reads the snapshot with a GitHub fallback; the bake runs
on every merge to the games repo's `main`.

## The problem

Every play of a published game used to rebuild it on the request path:

1. `getGameSources` fans out into authenticated GitHub reads — the game's own files,
   plus each GameKit module its `GAME.json` selects, plus the shared shell and audio.
2. `bundleGameTypeScript` runs esbuild over the result.
3. `assembleGameHtml` produces the self-contained document.

Cached for five minutes per slug, per instance. With `--min-instances 0`, a cold
instance did that work for whichever games the visitor happened to open.

Three things follow from that, and all three are avoidable:

- **GitHub API availability and quota became a dependency of the play route** — the one
  route that must never be down. A per-file Contents fan-out for the _catalog_ had
  already caused a rate-limit outage once; that is why `getCatalog` batches through
  GraphQL (see the comment at `github-client.ts:919`). Game assembly kept the same
  shape.
- **The work is identical every time.** A published game changes only when someone
  merges to the games repo's `main`. Rebuilding it per cache miss recomputes a
  constant.
- **The cost lands on the visitor**, in a service pinned to `--max-instances 1` while
  the multiplayer relay keeps room state in one process's memory.

Baking moves the same work to merge time. Nothing about the work changes — only how
often it happens.

## Shape

```
current.json                              ← the pointer (small, mutable)
snapshots/<id>/catalog.json               ← CatalogGameEntry[]
snapshots/<id>/games/<slug>.json          ← { slug, title, html }
snapshots/<id>/media/<slug>/<filename>    ← screenshots and gameplay video
```

Snapshot prefixes are immutable; only `current.json` is ever overwritten. Three
properties fall out of that:

- **Publishing is atomic.** Objects are written first and the pointer moves last, so a
  half-written snapshot is invisible and the site serves the previous one throughout.
- **Rollback is a pointer rewrite**, not a rebuild.
- **Everything under `snapshots/` is safe to cache forever**, which is what makes
  putting a CDN in front of the bucket a configuration change rather than a redesign.

## Who bakes, and why it is this side

`scripts/publish-snapshot.ts` runs in _this_ repo and reuses `assembleGameHtml` — the
same function the play route calls.

The games repo has its own `tools/build.ts` that emits standalone HTML, and uploading
that instead would have removed GitHub from the loop entirely. It was the wrong trade:
the restrictive CSP, the AI Act art. 50(2) provenance meta and the credential scan are
applied _here_, at serve time. Baking on the games-repo side would move serve-time
policy into a repo that does not own it, and would invert the drift problem that
`games-repo-contract.ts` exists to prevent. It would also mean giving the games repo
GCP credentials.

So: the games repo stays the source of truth for _content_, this repo stays the source
of truth for _what a served game is_, and the bake is where the two meet.

## Serving

`apps/api/src/submissions.ts` consults the snapshot first on three routes:

| Route                              | Snapshot hit                  | Snapshot miss or error     |
| ---------------------------------- | ----------------------------- | -------------------------- |
| `GET /api/catalog`                 | `snapshots/<id>/catalog.json` | `client.getCatalog(ref)`   |
| `GET /api/games/:slug`             | pre-assembled document        | GitHub sources + esbuild   |
| `GET /api/games/:slug/media/:file` | snapshot bytes                | `client.getGameMedia(...)` |

**The snapshot is a fast path, never a requirement.** An unset `GAMES_SNAPSHOT_BUCKET`,
a game that failed to bake, an unbaked media file and a Cloud Storage outage all
degrade to exactly the behaviour the site had before this existed. That is deliberate:
the fallback is the reason this change is safe to ship in one step.

Two invariants survive unchanged, and are tested:

- **Publication is still decided by the catalog**, not by what happens to sit in the
  bucket. A stale object cannot resurrect an unpublished game.
- **Media is still gated by the catalog allowlist** before the snapshot is consulted, so
  a stray object cannot widen what the API will serve.

One deliberate exception: `isSlugPublished` skips the snapshot when it forces a
refresh. That only happens during the publishing→published transition, which is
precisely the window where the snapshot is the stale source and GitHub is the fresh
one.

## The publish path

```
merge to games-repo main
  → validate.yml: npm run check
  → validate.yml: regenerate + commit catalog.json
  → validate.yml: repository_dispatch → this repo
  → publish-games.yml: npm run snapshot:publish
  → objects written, then current.json moves
  → running instances pick it up within the pointer TTL (~1 min)
```

No redeploy is needed — instances re-read the pointer on its own TTL.

Manual publish (after an assembler change here, or to recover a failed run): run
**Publish games snapshot** via `workflow_dispatch`. It takes a `ref` and a `dry_run`
that reports what would be baked without writing.

Locally:

```bash
GAMES_REPO_TOKEN=... npm run snapshot:publish -- --dry-run
GAMES_REPO_TOKEN=... GAMES_SNAPSHOT_BUCKET=... npm run snapshot:publish
```

### A game that fails to bake

It stays in the snapshot catalog and simply gets no game object, so its play route
falls back to GitHub — exactly what it did before. Dropping it from the catalog would
silently unpublish a game because of a transient build failure, and catalog membership
is the games repo's decision, not the bake job's.

The job still exits non-zero, because the games repo's own gate should have caught it.

## Configuration

| Name                    | Where                      | Purpose                                                |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| `GAMES_SNAPSHOT_BUCKET` | Cloud Run env var          | Bucket to read snapshots from; unset disables the path |
| `GAMES_REPO_TOKEN`      | this repo, Actions secret  | Contents:read PAT on the games repo, for the bake      |
| `SITE_DISPATCH_TOKEN`   | games repo, Actions secret | Fine-grained PAT that may dispatch into this repo      |

IAM is split by direction: the deploy service account has `storage.objectAdmin` (it
writes), the Cloud Run runtime SA has `storage.objectViewer` (it reads). A compromised
runtime cannot rewrite what it serves. `infra/setup-gcp.sh` step 7 provisions all of it,
including a 90-day lifecycle rule on `snapshots/`.

If the games repo ever goes 90 days without a merge, the live snapshot ages out and
serving falls back to GitHub — degraded, not broken, which is the right way for a cost
control to fail.

## What this does not solve

- **Bytes still flow through Cloud Run.** The API remains the games origin, which is
  what keeps `PRIVATE_BETA` and the rate limits meaningful. Serving the bucket to
  browsers directly would be faster and would take Cloud Run out of the byte path, but
  it makes published games publicly reachable URLs and bypasses the beta gate. The
  object layout is already CDN-shaped for when that trade becomes worth making.
- **Preview and draft routes still read GitHub live**, and should — an unmerged PR head
  has no snapshot, and that immediacy is the point of the creator's build channel.
- **`--max-instances 1`** remains the scaling ceiling (see `docs/roadmap.md`). This
  removes work from each request; it does not add instances.

# Published-game snapshots

**Status: ✅ built.** When `GAMES_SNAPSHOT_BUCKET` is set, published catalog / play /
media are served **only** from the Cloud Storage snapshot. The bake runs on every
merge to the games repo's `main`. Unset the env var for local/dev / fixtures /
`local-games-repo` — that is an opt-out, not a fallback from a configured bucket.

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
same function the play route calls when the snapshot is not configured.

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

`apps/api/src/submissions.ts` reads the snapshot on three published routes when
`GAMES_SNAPSHOT_BUCKET` is set:

| Route                              | Snapshot hit                  | Miss / error (bucket configured)                                           |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `GET /api/catalog`                 | `snapshots/<id>/catalog.json` | No pointer / Storage error → **503** (no `client.getCatalog`)              |
| `GET /api/games/:slug`             | pre-assembled document        | Storage error → **503**; published in catalog but object missing → **502** |
| `GET /api/games/:slug/media/:file` | snapshot bytes                | Storage error → **503**; allowlisted but object missing → **404**          |

Slug not in the catalog → **404** (unchanged). Publication authority is the snapshot
catalog, not “object exists in the bucket” — a stray object cannot resurrect a game.

**When the bucket is configured, there is no GitHub assemble on the published serve
path.** GitHub remains the source of truth for content (the bake reads it) and for
draft / PR preview routes (unmerged heads have no snapshot). Unset
`GAMES_SNAPSHOT_BUCKET` is the local/dev opt-out and restores the GitHub / fixtures /
`local-games-repo` path.

In-process caches (catalog TTL, game TTL, last-known catalog on refresh failure) still
apply; they cache snapshot results, not a GitHub escape hatch.

Two invariants survive unchanged, and are tested:

- **Publication is still decided by the catalog**, not by what happens to sit in the
  bucket. A stale object cannot resurrect an unpublished game.
- **Media is still gated by the catalog allowlist** before the snapshot is consulted, so
  a stray object cannot widen what the API will serve.

One deliberate exception: `isSlugPublished(..., { refreshOnMiss: true })` skips the
snapshot when it forces a refresh (`forceFresh`). That only happens during the
publishing→published transition, which is precisely the window where the snapshot is
the stale source and GitHub is the fresh one — status correctness while the bake is
still in flight.

## The publish path

```
merge to games-repo main
  → validate.yml: calculate scope + repository_dispatch (pinned SHA)
  → publish-games.yml: run the scoped/static/full games gate
  → publish-games.yml: npm run snapshot:publish (only after a green gate)
      (derives catalog.json from the games archive — including code-derived touch —
       and writes it into the snapshot; the games repo does not commit catalog.json)
  → objects written, then current.json moves (only if every game baked cleanly)
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

### How the bake reads the games repo

**One tarball, not a read per file.** A bake touches nearly everything in the games
repo — sources, media, catalog — and reading that through the contents API cost about a
thousand requests per run. `GAMES_REPO_TOKEN` is shared with CI's `contract:games-repo`
check, so at a bake per push to the games repo those bursts emptied the PAT's hourly
budget and 403'd both jobs (2026-07-28).

`fetchGamesRepoArchive` ([`games-repo-archive.ts`](../apps/api/src/platform/games-repo-archive.ts))
downloads `GET /repos/<repo>/tarball/<ref>` once and hands `createGitHubClient` a
`RepoFileSource` backed by it. Assembly logic is untouched — the same
`getGameSources` / `getGameMedia` / `getCatalog` run against archive bytes instead of
API responses, so there is no second implementation of "what a served game is" to drift.
Only `games/`, `shared/` and `catalog.json` are retained in memory; `tools/` and `docs/`
are dropped as they stream past.

The archive is pinned to the ref it was downloaded for and refuses reads for any other —
otherwise a PR preview could be quietly served files baked from `main`. If the download
fails, the bake logs it and falls back to per-file contents reads: slower and expensive,
but a stale snapshot is worse than an expensive one.

### A game that fails to bake

A non-empty `failures` list does **not** advance `current.json`. Immutable objects under
the new snapshot id may still be written (including a full catalog listing) for
debugging, but the site keeps serving the previous good snapshot. Failed games are not
half-published, and successful peers are not silently dropped from a newly published
catalog.

Do **not** flip the pointer while omitting failed games from the new catalog — that
would unpublish them. Prefer “pointer stays put”.

The job still exits non-zero, because the games repo's own gate should have caught it.

### Takedowns

Publication authority now follows the **snapshot catalog**, so removing a game from the
games repo is not complete until the next `publish-games.yml` run is green. Until the
pointer flips, the previous snapshot keeps serving the game, and a bake that fails
leaves that old snapshot serving until something re-bakes it — there is no expiry that
retires it on its own.

The nightly `schedule:` in `publish-games.yml` (04:23 UTC) is that something. It bounds
how long a stale snapshot can serve at roughly a day, covering both a takedown whose
bake failed and a dispatch that stopped arriving at all. It is a floor on recovery, not
a substitute for the merge-time publish, and a day is far too slow for an urgent
takedown. That daily run uses the same cheap full gate as a merge (playtest `--suite
default`, no catalog `agent-play`). The Sunday 06:17 UTC cron is a separate catalog
seal (`playtest --all` plus `agent-play`); it is not the staleness floor.

If a takedown is urgent, do not wait for the next merge: run **Publish games snapshot**
via `workflow_dispatch` against the games-repo ref that already omits the game. That
manual re-bake is the escape hatch. Confirm the takedown against the live site, not
against the games repo — a green merge there is not evidence the game stopped serving.

## Configuration

| Name                    | Where                      | Purpose                                                |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| `GAMES_SNAPSHOT_BUCKET` | Cloud Run env var          | Bucket to read snapshots from; unset disables the path |
| `GAMES_REPO_TOKEN`      | this repo, Actions secret  | Contents:read PAT on the games repo, for the bake      |
| `SITE_DISPATCH_TOKEN`   | games repo, Actions secret | Fine-grained PAT that may dispatch into this repo      |

**`SITE_DISPATCH_TOKEN` is a write-capable credential, and cannot be made otherwise.**
`repository_dispatch` is gated by **Contents: read+write** on `gamedevpl/www.gamedev.pl`
— GitHub exposes no narrower permission for it, so a token that can only ask for a bake
does not exist. In practice the games repo holds a PAT that could also push to this
repo's contents. Mitigate by scope, since it cannot be mitigated by permission: grant it
**that one repository and nothing else**, give it a real expiry, record that expiry in
the PAT ledger next to `github-token` and `GAMES_REPO_TOKEN`, and treat a leak of it as
a compromise of this repo rather than of the games repo.

IAM is split by direction: the deploy service account has `storage.objectAdmin` (it
writes), the Cloud Run runtime SA has `storage.objectViewer` (it reads). A compromised
runtime cannot rewrite what it serves. `infra/setup-gcp.sh` step 7 provisions all of it,
including a 14-day lifecycle rule on `snapshots/`.

The window is bounded by bakes rather than merges: `publish-games.yml` rebuilds on a
04:23 UTC cron whether or not anything merged. It would take 14 consecutive failed
bakes for the live snapshot to age out and published serving to return **503** until
a fresh bake restores `current.json` — the lifecycle rule is a cost control, not a
soft degrade to GitHub.

## What this does not solve

- **Bytes still flow through Cloud Run.** The API remains the games origin, which is
  what keeps `PRIVATE_BETA` and the rate limits meaningful. Serving the bucket to
  browsers directly would be faster and would take Cloud Run out of the byte path, but
  it makes published games publicly reachable URLs and bypasses the beta gate. The
  object layout is already CDN-shaped for when that trade becomes worth making.
- **Preview and draft routes still read GitHub live**, and should — an unmerged PR head
  has no snapshot, and that immediacy is the point of the creator's build channel.
- **GitHub remains SoT for content and for the bake.** Removing the published-serve
  fallback does not mean GitHub left the system; it means visitors no longer pay for
  assembly when the snapshot is the configured source.
- **`--max-instances 1`** remains the scaling ceiling (see `docs/roadmap.md`). This
  removes work from each request; it does not add instances.

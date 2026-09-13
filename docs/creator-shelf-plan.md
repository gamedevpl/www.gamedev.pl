# Creator shelf: one read instead of every round

> Status: **plan, nothing built** (2026-09-13). Written after the read meter from
> [`firestore-read-cost.md`](./firestore-read-cost.md) put `/api/submissions/mine` at
> **57.5 Firestore reads per request** (9,375 reads over 163 requests in a two-hour sample)
> and the attempt to fix it cheaply in
> [#1310](https://github.com/gamedevpl/www.gamedev.pl/pull/1310) found there was no cheap fix.
> This document says why, what the real fix is, in what order, and what it is worth.

## What the number actually is

The shelf reads every round a creator owns and collapses them to one row per game
(`collapseJobsToOwnerGames` in `owner-games.ts`). The collapse needs **every** round: the
tip is the newest non-abandoned round of each game, and a game whose tip is unpublished can
still carry `catalogPublishedAt` from an older published sibling. Limit the query and games
go missing or get the wrong tip. The query is already equality-indexed on `ownerUid`. The
reads are the data the answer requires.

So the cost is **rounds per creator**, and measured on 2026-09-13 that distribution is:

| | rounds | games | shelf-eligible |
| --- | --- | --- | --- |
| owner 1 | **154** | 75 | 28 |
| owner 2 | 9 | 9 | 2 |
| owners 3–7 | ≤ 8 | ≤ 6 | ≤ 2 |

186 submissions, 7 owners, p50 = 5 rounds. **The 57-read shelf is one account** — the
operator's own. Every other creator's shelf costs about five reads, and would not notice
any of this. What the shape *does* do is grow with a creator's lifetime: a creator who
builds seriously for a year looks like owner 1, and the shelf is polled.

That reframes the priority. This is not urgent. It is insurance for creator longevity, and
it is worth buying only because it can be kept correct cheaply — see the consistency model
below. If it could not, the honest answer would be to leave it.

## Who reads the owner's rounds, and what each one actually needs

Six callers of `listSubmissionsByOwner`, three shapes:

| caller | needs | shape |
| --- | --- | --- |
| `/api/submissions/mine` (`creator-self-routes.ts`) | per-game tips + published sibling | **shelf** |
| CLI intake chat (`cli-chat-routes.ts:160`) | the collapsed shelf | **shelf** |
| Studio shelf (`creator-studio.ts:163` via `loadShelfRecords`) | collapsed shelf, plus `previewVersion`/`deliveredVersion` on each tip for the Edit pill, plus a deep-link fallback for a game below the 50-row cap | **shelf** |
| code checkout (`creator-code.ts resolveOwnedRecord`) | newest live round **for one slug** | **per-slug** |
| base version (`round-base-version.ts:41`) | prior rounds **for one slug** | **per-slug** |
| account erase, deleted-account listing | genuinely all rounds; rare | leave alone |

Two of the six do not want the shelf at all. They want one game's rounds and are paying for
all 154 to get them — and both sit on the **build path**, where latency is felt.

## Part A — a per-slug query (no schema, do first)

`listSubmissionsByOwnerAndSlug(ownerUid, slug)`: two equality clauses. Firestore intersects
the two single-field indexes, so no composite index is needed — the same trick
`listOpenRoundsByOwner` already relies on. Cost becomes the rounds of that one game,
typically one to three, instead of every round the creator owns. No cache, no staleness, no
new document. Switch `resolveOwnedRecord` and `resolveRoundBaseVersion` to it.

This is half a day including tests, it helps every creator on the build path, and it is
worth doing whether or not Part B ever ships.

## Part B — the shelf document

### Shape: a mirror of the rounds, not a second copy of the rules

`shelves/{ownerUid}`, one document:

```
{ version: 1, builtAt, sourceCount,
  rounds: [ { jobId, createdAt, slug?, title, state?, abandonedAt?, publishedAt?,
              lastStatus?, lastNotifiedStatus?, previewVersion?, deliveredVersion? }, … ],
  truncated }
```

It stores the **minimal fields of every round**, and the reader runs the *existing*
`collapseJobsToOwnerGames` over them unchanged. Not precomputed tips, deliberately:

- the collapse differs by mode — shelf mode drops canceled rounds before grouping, published
  mode does not, so the tip of a game can differ between the two, and one precomputed tip
  cannot serve both;
- the rules stay in one place; a shelf document that reimplemented them would drift from
  `owner-games.ts` the first time either changed.

154 rounds at ~120 bytes is ~18 KB. Cap at 2,000 rounds with `truncated: true`, and read
from source past the cap; no real creator is near it and a 1 MiB document is not a place to
find out.

### Consistency: three layers, because no single one is enough

The facts that make this the hard part: there is **no write chokepoint** (`submission-facade.ts`
wraps four setters; `createSubmission`, `recordJobTransition`, `setSubmissionPublishedAt`,
`setSubmissionAbandoned`, the two status setters and the erase path's `ownerUid` reassignment
all write directly to slices), submissions carry **no `updatedAt`**, and
[`rollback-deploy.md`](./runbooks/rollback-deploy.md) puts an older revision back in front of
traffic that will write rounds without ever having heard of the shelf document.

1. **Write-through, rebuilt from source.** Every shelf-relevant writer calls
   `rebuildShelf(ownerUid)`: `listSubmissionsByOwner` (N reads) then one `set`. Not a patch
   of one entry — a rebuild, so it is correct by construction and there is no drift
   arithmetic. N reads per write is fine: writes are rare next to a polled read. Because the
   document lives in Firestore, **all instances see the rebuild** — unlike the in-process
   windows shipped in #1294 and #1310, which are per instance.
2. **A count on read.** The document stores `sourceCount`; the reader does one `count()`
   aggregate on `ownerUid ==` (one billed read) and rebuilds on mismatch. This catches the
   two writes most likely to be missed — a create and the erase path's reassignment —
   without knowing who wrote. It does not catch an in-place field update.
3. **A bounded rebuild, never once-ever.** A pass rebuilds every shelf older than the
   interval from source. Per the lesson recorded in `open-round-backfill.ts` and its memory,
   the marker records *when the last pass ran*, not that one happened, so a rollback that
   writes rounds behind the document's back is corrected on the next pass rather than
   never. At 186 rounds a full pass is ~186 reads; hourly, that is ~4.5K reads a day, and
   it is the floor that turns "a writer I forgot" from a permanent bug into a one-hour one.
   Hook it into `notify-sweep`, which already runs every two minutes.

Staleness bound, stated: immediate for every writer that is hooked, on every instance;
**at most one hour** for a writer that is not, or for a rollback revision. Compare: today's
windows are 60 s / 10 s, but per instance.

For the heavy account the shelf goes from **154 reads a load to 2** (document + count).

### Rollout, in three pull requests

1. **Part A** — the per-slug query and its two callers. Independent; ship first.
2. **Shadow.** Add the document, the write-through, the rebuild pass. **Readers keep reading
   source.** Each shelf read also loads the document and logs a mismatch — the read meter's
   `firestore reads` line already carries the route, so add `shelfMismatch: true` to it. Run
   for a week. The success criterion is **zero mismatches**, not "it seemed fine".
3. **Flip.** Readers take the document, falling back to source when it is missing, the wrong
   `version`, or `truncated`. Keep the fallback forever: it is cheap, and it is what makes
   the document a cache rather than a second source of truth.

### What could go wrong, and what catches it

- **A writer nobody hooked.** The count on read catches creates and reassignments; the
  hourly pass catches everything else. Bounded, never silent.
- **A rollback revision.** Same answer, by design — this is exactly the case
  `deploy-rollback-writes-unflagged-rows` is about.
- **Account erase.** Reassigning `ownerUid` to `DELETED_ACCOUNT_UID` must rebuild *both*
  shelves and delete the erased owner's document; `erase-account.ts` is the one place to do
  it, and the count guard covers the gap if it is missed.
- **The Studio deep link.** `loadShelfRecords` looks a requested game up by slug or token
  when it is below the 50-row cap. That fallback stays as it is — `getSubmissionBySlug` is
  one read.
- **Document size.** The 2,000-round cap and `truncated` fallback; nobody is within an order
  of magnitude of it.

### Verification

Not by reasoning — by the meter. After the flip, `route=/api/submissions/mine` should show
`fsReads` of 2 for the heavy account where it shows ~57 today, `shelves/*` and
`count:submissions` as the shapes, and the shadow week's mismatch count must be zero.
`infra/read-cost-report.sh 7d` before and after.

## Decisions

Made here, override if wrong:

- **`shelves/{uid}`** rather than `users/{uid}/shelf/current`: top-level, one read, no parent
  document to exist first. The erase path has to know about it either way.
- **Rebuild interval one hour.** Cheaper and it matches the staleness bound worth promising.
- **Mirror rounds, not tips** — reasons above.

Yours:

- **Ship Part B now, or gate it?** Today it helps one account. The honest trigger for
  building it is either a second creator at owner-1 scale or the meter showing
  `/api/submissions/mine` climbing week over week. Part A is worth shipping regardless.

## Estimate

Part A: half a day. Part B: about two days of work across PRs 2 and 3, plus the shadow week
in between — the week is the expensive part, and it is not optional.

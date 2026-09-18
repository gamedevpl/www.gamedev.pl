# Firestore read cost

Reads, not writes, are what the free tier runs out of. The cost-controls program bounded
writes and paid vendor calls; the day this document starts from, the project was doing
~364K document reads a day against a 50K/day free tier while writing a few hundred.

The shape is never a loop. It is always the same mistake: **a collection query on a path
that something polls**, so the read rate is set by how many browser tabs are open rather
than by how much the data changes.

## The rule

> Read a collection once per window, never once per request.

Two corollaries, both of which have been got wrong here:

1. **The window must be wider than the poll it serves.** A sixty-second window behind a
   two-minute poll has always expired by the time the same tab comes back, so it costs
   the same as no cache at all while looking like one.
2. **A write that makes a cached answer wrong must drop it.** Otherwise the window's
   width is a lie about how stale the surface may be, and someone will widen it until
   the product is wrong.

## Where the windows are

| Surface                     | Poll  | Window                   | Dropped by                                                                                  |
| --------------------------- | ----- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `/api/catalog` enrichment   | —     | 10 min                   | writing an enrichment (`catalog-enricher.ts`)                                               |
| store catalog + media       | —     | 10 min                   | publishing a game (`catalog-routes.ts`)                                                     |
| notify sweep health scan    | 2 min | 10 min                   | recording a verdict (`notify-sweep-routes.ts`)                                              |
| notify sweep per-job derive | 2 min | 0/10/60 min by stillness | a move, a status change, uncollected feedback (`sweep-cadence.ts`)                          |
| `/api/review/status` badge  | 2 min | 10 min                   | the reviewer's own verdict; an operator's sweep change or requeue (`review-queue-cache.ts`) |
| `/api/notifications` bell   | 1 min | 5 min                    | creating, reading or clearing a notification (`notification-cache.ts`)                      |
| Studio connect guide        | 10 s  | —                        | reads one document by id; cadence widens instead (`LocalActivityStatus.tsx`)                |
| Studio health scan          | mount | 10 min                   | publishing or transferring a game (the slug set is in the key) (`studio-health-cache.ts`)   |

Per-user surfaces — the reviewer badge and the bell — key their windows by uid, and the
bell keys by store as well, so one person's queue can never answer another's poll. That
is a correctness property with tests, not a performance detail.

What each window costs in freshness is bounded, but the bound is **one window for any
action, including your own**. The caches are process-local, and the API deploys with
`--max-instances 4` whenever `MP_RELAY_URL` is set (`.github/workflows/deploy.yml`), so a
write handled by one instance drops only that instance's window: your next poll can land
on another and get the old answer. On a single instance, and for whichever instance
served the write, an own action is reflected immediately — but do not design a surface
that needs that, and do not write it down as a guarantee. Making own-write freshness true
across instances needs shared invalidation (a durable version key both instances read),
which is not what a badge is worth.

## The floor underneath the windows

Every one of those windows removes a _collection scan_. None of them removes the read that
happens before the route runs: `getSessionUser` reads `users/{uid}` on **every
authenticated request**, so a signed-in tab pays one document lookup per poll, per
surface, forever. Four polled surfaces on one open tab is a few thousand reads a day
before any route does its own work.

Two things bound it:

1. **`FirestoreIdentityStore` holds the session user for 30 seconds** and drops the entry
   on every write through the store — profile edits, tier changes, deletion requests. It
   is deliberately much shorter than the content windows above, because `tier` and the
   block live on that document. The cost is real and must be stated: a block applied
   **outside** the app, or on another instance, is enforced up to 30 seconds late. A block
   applied through the API is immediate on the instance that applied it.
2. **A poll that has nothing to report widens itself.** The connect guide asked every ten
   seconds whether a local agent was running, whether or not one existed, and rendered
   nothing when the answer was no — an invisible ~17K reads a day for one forgotten tab.
   It now polls fast while a task runs, widens to a minute once six polls in a row come
   back empty or the task finishes, and stops entirely while the tab is hidden.

The general rule this leaves: **a poll's cost is its cadence times its cheapest possible
answer, and "nothing to show" is the answer it will give most of the time.**

### The status poll: three different meanings of "nobody is watching"

`/api/submissions/:token` is the Studio status poll, three seconds per open tab on any
round that is not `published` or `abandoned`. On 2026-09-13 it served **2,572 requests in
the 02:00 UTC hour** — the user agents were two ordinary browser tabs on a Mac, not a CLI
and not an agent. One of them held the service above A30's 8 reads/s drift threshold for
**six and a half unbroken hours**; A30's condition needs three. Closing a single tab took
the rate from 13/s to 0.76/s.

Per-request cost was not the problem: it had already fallen from 26–35 reads to 7.35, and
the minimum idle rate never moved (3.07 / 3.30 / 3.65 reads/s across 09-11, 09-12, 09-13).
What rose was **occupancy** — the share of the day spent above the line went 29% to 61% to
96%. Split the distribution before calling a higher hourly average a new floor; "the code
got more expensive" and "something is polling more of the time" have opposite fixes.

One open tab is about 285K reads a day, so this scales with **creators**, the axis the
product is supposed to grow on. Neither of the two existing axes covers it: the tab is not
shared work and the cost is not keyed by what the reader has done.

So `pollDelayMs` answers how fast a round wants to be watched, and `pollGating.ts` answers
how fast anyone actually is. Three gates, because "nobody is watching" has three distinct
causes and each needs a different signal:

| Gate         | Signal                      | Effect                                      |
| ------------ | --------------------------- | ------------------------------------------- |
| Hidden       | `document.hidden`           | stops; catches up on `visibilitychange`     |
| Idle         | no `pointerdown`/`keydown`  | 10s after 2 min, 30s after 10, 60s after 30 |
| Server floor | `pollAfterMs` in the status | 3s while moving, 10s once quiet             |

**The two client gates may be aggressive; the server floor may not.** Both client gates are
conditioned on nobody looking, and interaction lifts them at once, so a minute of staleness
costs a creator nothing. The server floor applies to every client, including a tab someone
is watching right now, so it is sized by what can still happen rather than by how long
nothing has.

**Visibility alone does not catch a creator who walked away**, which is why the idle gate
exists: a forgotten tab stays focused, and `document.hidden` reports it as watched. Equally,
idleness is never _inferred from an absence of observation_ — where there is no `document`
to listen to, the idle gate does not apply at all, or a non-browser consumer would throttle
itself to a minute with nothing able to reset it.

**The server floor is where the policy belongs.** A cadence compiled into a bundle can only
change on a deploy that every open tab must reload to receive; a number in the response
reaches the next poll.

Sizing it against the 60s status-cache TTL was the first attempt and was wrong, which is
worth recording because the reasoning is seductive: a poll faster than the TTL can only
re-read an identical cached body, so the TTL looks like a free ceiling. **A cache TTL bounds
how stale the server's own copy may be; it says nothing about the answer.** `onEvent` busts
that cache the moment an agent acts, and a quiet self round is precisely the one an agent
rejoins — `start` pulses Studio so "agent stopped" cannot sit beside live progress, and
every stage refreshes the heartbeat (`.claude/skills/byoca-mcp/SKILL.md`). A minute-long
floor would have restored a lingering-state bug that skill records as already fixed. The
widening therefore stops at **10s**, and `dispatched` keeps 2s to match its own cache.

None of the three delays the creator: their own actions invalidate the cache and call
`pokeStudioStatus`, which ticks immediately and skips every gate. The gates gate repeats,
never the first read — a mount still answers the page once.

**A gate on the store reaches only what subscribes to it.** The welcome dialog and the
connect wizard each ran their own `getSubmissionStatus` loop on a bare `setTimeout`, so both
polled at three seconds behind a hidden tab and neither honoured `pollAfterMs` — measured at
**30 requests in five hidden minutes** for the welcome dialog alone. Both now go through
`useGatedStatusPoll`, which subscribes to the store and therefore inherits all three gates,
and shares one fetch with anything else watching the same round. `EditorPanel`'s loop stays
as it is on purpose: it runs only while a creator is waiting for a publish they asked for,
and ends on the seal, so throttling it would stall an action rather than save an idle poll.

**A sandboxed frame eats the events the gate listens for.** Games render with no
`allow-same-origin`, so a creator playtesting inside the Studio stage produces no
`pointerdown` or `keydown` on the parent document at all — the most engaged creator on the
site would have been classified idle after two minutes. `StudioStage`'s `onGameActivity`,
which already existed for play chrome, now also reports the interaction.

**Resetting the idle clock is not the same as lifting the gate.** Recording a fresh
interaction leaves the slow timer that is already scheduled, so a creator who typed just
after a poll waited out the old sixty seconds anyway. `noteStudioInteraction` reschedules
whenever the floor it just lifted was non-zero — and only then, so ordinary typing does not
churn timers. The test for this originally dispatched `visibilitychange` alongside the
interaction, which reached `rescheduleAll` by the other path and hid the bug completely.

### The per-user half is the only part that grows with visitors

The shared windows above make the frightening numbers flat: `/api/catalog` costs 293 reads
cold and **1** warm, six refreshes an hour whether one person visits or ten thousand. They
scale with catalog size, not traffic. What no shared window covers is the part keyed by the
reader, and on 2026-09-12 there was exactly one: `/api/recommendations` read
`users/{uid}/playAffinity` on every home load, one document per game that player had ever
opened — 21 and 85 rows in two sampled requests. That cost is **doubly** linear, visitors
times their own history, so ten thousand home loads a day by returning players is about
230K reads, roughly what the whole service did that day.

It now has a **60-second window per uid**, dropped the moment that player records a play.
Sixty seconds rather than the bell's five minutes because the last-played shelf is visible:
same-instance invalidation makes your own play immediate, and cross-instance staleness is
bounded at a minute. Cold misses share one in-flight read, so a burst of tabs is still one
query, and a play landing mid-read discards the answer rather than sealing it in.

The rule this leaves for any new surface: **ask which half of the request is shared and which
is keyed by the reader.** Only the second half multiplies by traffic, and it is never the half
that looks expensive in a per-request ranking.

### The third axis: a query keyed by the owner, not the reader

Neither half of that split covers a query keyed by _whose_ data it is. `submissions` was read
by `ownerUid` alone in four places that wanted a single game — `resolveOwnedRecord`,
`resolveRoundBaseVersion`, the staged-preview base lookup and the draft-preview fallback. Each
paid for the owner's entire shelf to answer a question about one slug. Measured on 2026-09-12
the shelf distribution was 154/9/8/5/4/4/2 rounds per owner across 186 submissions and 7 owners,
so the expensive case was one account, and the median was five.

That shape does not scale with traffic and it does not scale with the catalog. It scales with
**how much one creator has made**, which is the one axis a product like this wants to grow, and
it grows without anybody visiting. A per-request ranking never flags it, because on six of the
seven accounts it is cheap.

### The shelf itself: mirrored, and on probation

The narrow query above fixes the callers that wanted one game. The shelf readers genuinely
need every round: `collapseJobsToOwnerGames` picks each game's newest live round as its tip,
and a game whose tip is unpublished can still carry `catalogPublishedAt` from an older
published sibling. Limit the query and games go missing or get the wrong tip. Those reads are
the data the answer requires, so the only way to make them cheaper is to stop deriving the
answer from source on every poll.

`shelves/{ownerUid}` is that mirror: one document holding the **minimal fields of every
round**, over which the reader runs the existing collapse unchanged. Deliberately not
precomputed tips — the collapse differs by mode (shelf mode drops canceled rounds before
grouping, published mode does not, so one precomputed tip cannot serve both), and a document
that reimplemented the rules would drift from `owner-games.ts` the first time either changed.

**Three consistency layers, because no single one is enough.** There is no write chokepoint
to hook — `createSubmission`, `recordJobTransition`, the two status setters, `publishedAt`,
`abandonedAt`, the slug/title/version setters and the erase path's `ownerUid` reassignment all
write directly — and submissions carry no `updatedAt`:

1. **Write-through, rebuilt from source.** Every shelf-relevant writer rebuilds the whole
   document from `listSubmissionsByOwner`. A rebuild rather than a patch of one entry, so it
   is correct by construction and there is no drift arithmetic to get wrong. Because the
   document is in Firestore, **every instance sees it** — unlike the per-instance windows
   above. "Every writer" includes the two _atomic_ slug claims, which write the slug
   themselves rather than through the plain setter, `setDraftShared`, and the
   membership writers that change who a round belongs to without touching the
   submission row (`acceptGameTransferInvitation`, `acceptEditorInvitation`,
   `removeEditor`, `leaveGame`).

   Coalescing concurrent rebuilds is not enough: a write landing after a running rebuild has
   read source but before it writes would be waited on and then lost, so the mirror requeues
   one more pass instead of joining a snapshot that is already behind. Same invariant as the
   sweep cadence — _void the deferral when the record moves_.

2. **A count on read.** The document stores `sourceCount`; the reader spends one `count()`
   aggregate and rebuilds on disagreement. This catches a create or a reassignment without
   knowing who wrote. It cannot catch an in-place field update, which is why there is a third
   layer.
3. **A bounded pass, never once-ever.** `runShelfRebuildPass` rebuilds shelves older than an
   hour, ten per run, riding `notify-sweep`. It reports failures by _inspecting the rebuild's
   answer_, because the mirror swallows its own errors — a `try`/`catch` around it can never
   fire, so the first version reported `shelvesFailed: 0` however many shelves went unwritten,
   certifying a repair layer that had done nothing. Listing failures are caught too: this is
   derived state riding a notification job, and a throw here would turn a completed sweep into
   a 500 and a scheduler retry. The marker is _when the last pass ran_, never
   that one happened — a rollback puts code in front of traffic that writes rounds without
   knowing the document exists, so a once-ever marker would retire the only thing that
   notices it. Same lesson as `open-round-backfill.ts`.

Staleness, stated: immediate on every instance for a hooked writer, **at most one hour** for a
writer nobody hooked or a rollback revision.

**Readers still read source.** This is a shadow: each shelf read also loads the document,
judges it against what the reader is about to serve, and annotates its own `firestore reads`
line with `shelfShadow` and, on disagreement, `shelfMismatch`. The comparison is on the
**collapsed** output, so a difference the collapse would have hidden is not reported as drift,
and `absent` / `version` / `truncated` / `count` / `collapse` are distinguished rather than
lumped into one failure. The bar for pointing readers at the document is **zero mismatches
over a full week**, not "it seemed fine".

**A probation check is only as strong as its fingerprint**, and the first version of this one
was not strong enough: it compared jobId, slug, title and status, and so would have certified
a mirror that served a different `publishedAt`, a different Edit pill (`previewVersion` /
`deliveredVersion`) or a missing draft-sharing indicator. It now covers every tip field either
shelf response serves, with a test that walks them one at a time. The same review found
`draftSharedAt` missing from the mirrored round altogether and `setDraftShared` unhooked — a
rebuilt shelf lost the sharing state permanently, and the weak fingerprint called it a match.
Two independent holes that happened to hide each other, which is the argument for making the
check specific rather than plausible.

**The cost this trades, stated plainly, because it is not obviously a win.** A shelf-relevant
write now costs one owner-query plus one document write, so a heavy account's round pays its
whole round count per write. That is cheaper than the poll it replaces only if writes are
genuinely rarer than reads for that account, and during an active build they may not be.
The shadow week is what settles it: sum `route=/api/submissions/mine` against the write path
in the meter before flipping anything. If write amplification exceeds the read it saves, the
right answer is to keep source as the reader and delete the document.

**A fourth gap, found live, not in review: an idle account cannot be reached by either
mechanism.** Write-through needs a write to fire; the hourly pass needs an existing document
whose `builtAt` has aged past the cutoff. An account whose last shelf-relevant activity
predates the mirror shipping, and who only polls afterward, has neither — there is no write to
hook, and no row for `listStaleShelfOwners`'s `builtAt <` query to match, because Firestore
cannot return a document that was never created. Confirmed against a live account: five rounds
all dated before the deploy, polling `/api/submissions/mine` on a steady cadence, reporting
`verdict: absent` on every single request with no way to stop on its own.

The fix is a lazy backfill: `recordShelfShadow` reads `verdict === 'absent'` as "nobody has
ever built this," not just "check again later," and calls `store.rebuildShelf(ownerUid)` —
**awaited**, coalesced by the mirror the same way a burst of concurrent polls already is. The
first version of this fired it unawaited, reasoning that the read it shadows should never wait
on a write. Wrong on this deployment: Cloud Run runs with `--cpu-throttling`
(`infra/deploy-api.sh`), so work left running after the response ships can be suspended
mid-flight, and the failure is silent — the next poll just reports `absent` again, as if
nothing had tried. `submissions.ts` already documents the same trap for a different seam. The
backfill is cheap and one-time per account, so paying its latency once is the right trade
against losing it.

A second thing the first version got wrong, caught in the same review: the mirror **answers
false on failure rather than rejecting** (`createShelfMirror` swallows its own errors), so a
bare `.catch()` never fired for the real failure mode — only a contrived test store that threw
made it fire at all. `backfillAbsentShelf` now checks the resolved boolean, not just the
rejection.

One rebuild, once, per account that was ever idle since the mirror shipped; every read after
that sees a real document and stops triggering anything. This means `absent` in the shadow log
is not itself a red flag — it is the marker for an account about to self-heal on its next read.
The 09-20 checkpoint should read the weekly mismatch count split by verdict, not as one number:
only `version` / `truncated` / `count` / `collapse` mean the document and source actually
disagreed.

**What the week to 2026-09-18 actually showed**, before the writers below were hooked:
656 `collapse`, 102 `count`, 0 `absent`, 3 distinct owners. Not a race and not warm-up —
it repeated every few minutes, and `absent` (the benign "not built yet") never appeared.
`MAX_SHELF_ROUNDS` is 2,000 and the owners had 4 and 155 rounds, so truncation was not it.

The two verdicts were two different unhooked writers, both real:

- **`count` (sourceCount 4, shelfCount 3).** A round in source never reached the document.
  Two cooperating holes: `acceptGameTransferInvitation` / `acceptEditorInvitation` changed
  membership without rebuilding the shelf, so a transferred or shared round existed in
  `reconcileTransferredOwnership` and not in `shelves/{ownerUid}`; and Firestore
  `countSubmissionsByOwner` took a raw `ownerUid` `count()` whenever the owner had no
  remaining `gameAccess` rows, so a sender who kept slugless rounds and transferred the
  slugged one compared 4 against a correctly rebuilt 3 forever. The hourly pass cannot
  heal a count definition that disagrees with the rebuilt document.
- **`collapse` (same count, different content).** `leaveGame` wrote `state: canceled` on
  the editor's live tip without `afterJobWrite` / a shelf rebuild, so the document still
  served that round as the tip while source collapse dropped it. The diverging field is
  one the fingerprint already covers (`createdAt` / `jobId` of the tip, via `state`).

Readers stay on source. Graduate them only after a later week of shadow logs is **zero
mismatches** split by verdict (`count` and `collapse` both 0, not merely quieter). Do not
flip in the same change that hooks the writers — the next week's log is the proof, and a
reader flip needs its own revert.

`listSubmissionsByOwnerAndSlug` replaces all four call sites. Two equality clauses used
to zigzag-merge the two single-field indexes — Query Insights measured
`listOpenRoundsByOwner` at 8.5 index entries scanned per result. Both queries now have a
COLLECTION composite in `infra/setup-gcp.sh` (`ownerUid+slug`, `openRound+ownerUid`).
Re-run that script against the live project; without the composite the query still
answers, it just keeps paying the merge. The wide `listSubmissionsByOwner` stays
for the surfaces that genuinely want the whole shelf: the Studio rail, the public creator page,
account erasure.

**The shelf poll then paid that owner query again, once per game.**
`reconcileTransferredOwnership` called `listSubmissionsBySlug` for every `gameAccess` row
the member was on, so a five-game sole owner paid five extra equality queries on every
`/api/submissions/mine` poll — Query Insights' hottest QUERY. The slug query is required
after a transfer (the recipient's owner query does not yet contain the sender's rounds) and
while editors, a revocation epoch, or a settlement that changed owner (accessRevision > 1)
mean another uid may have written siblings.

Those conditions are necessary but not sufficient: a legacy multi-uid slug is pristine at
revision 1 with no editors and no revocations, and nothing on the record says a second uid
wrote rounds on it. So `ownerQueryCoversAccess` is only a cheap pre-filter, and
`countSubmissionsBySlug` is the proof — a `count()` is charged one read per 1000 index
entries rather than one per round, so the sole-owner poll still stops paying per round, and
a count that disagrees with the owner rows falls back to the full list. Absence of proof
means query: a predicate that guessed wrong here drops a game's own history off its shelf.

Ordering is part of the contract, not an implementation detail. The query returns rounds
newest first with the job id breaking a tie, which the callers rely on to pick the round an
improvement builds from — `resolveOwnedRecord` picking the wrong record hands an owner's edit
a stale base to overwrite newer published work. The old in-memory sort compared `createdAt`
alone, so two rounds created in the same millisecond resolved in whatever order the scan
returned them. `store-parity.test.ts` pins both halves against the in-memory and fake-Firestore
stores, and pins the tie under a frozen clock — a tie test that waits on the real clock is a
lottery, not a test.

## The other half of the floor: our own sweeps

A browser poll needs a tab open. `notify-sweep` needs nothing — Cloud Scheduler posts to it
every two minutes, forever, and on 2026-09-12 it was **a third of an otherwise idle hour's
reads**: 34 active submissions re-derived 720 times a day, each derivation a pending-message
query plus a reconcile plus a status read, and 33 operator alerts re-emitted on top. The run
took 14 seconds of wall clock. Nothing in that work changed anything: the same 34 records had
been motionless for days, and all 33 alerts had been delivered long ago.

Two rules came out of it, and they generalise to any scheduled sweep here.

1. **A record's recheck interval is a function of how long it has been still.** `sweep-cadence.ts`
   holds a per-job next-due stamp: moving within the hour means every run, still for an hour
   means every ten minutes, still for a day means hourly. Two properties matter more than the
   numbers. A job this process has **never** derived is always due, so a cold start and every
   test derive everything — the cadence can only ever _defer a repeat_, never skip a first look.
   And **anything with a clock running on it stays hot**: an uncollected creator message, an
   observed transition, or a status that just changed all reset the record to every-run, because
   the alert those feed is the one thing a widened cadence could make late. A deferral is also
   **void the moment the record moves**: the stamp remembers the activity time it was granted
   against, and a newer one on the already-read record makes the job due again, so nothing that
   changed can sit unseen for an hour. The schedule is process-local on purpose: it is an
   optimisation, and losing it on a deploy costs one full run.

2. **An emit that is idempotent by id should stop asking.** Re-emitting an existing operator
   alert cost a document read _and_ a transaction commit per alert per run, which is how ~908
   commits an hour sat behind ~1,157 document writes a day: read-only transactions, committing
   nothing. `notify-sweep-routes.ts` now remembers the ids it has seen already present and skips
   them (`alertsSkipped` in the response and the log), and `createNotification` inserts with
   `create()` — the atomic insert — instead of reading inside a transaction to decide.

3. **An empty inbox should not be queried.** `listPendingCreatorMessages` with
   `deliveredAt IS NULL` was the sweep's per-job tax on motionless rounds: Insights counted
   thousands of executions, zero documents, and still billed the one-read minimum. Submissions
   now carry `pendingCreatorMessage`, written `true` atomically with an
   undelivered append, and `false` once `markCreatorMessagesDelivered` empties the inbox.
   The sweep skips a repeat query when the flag is `false`, but only after this
   process has been deriving for an hour (`RECHECK_HOURLY_MS`). A first look
   always probes, and dues inside that window still probe, because deploy.yml
   promotes the candidate to 100% while an old revision can still finish a
   feedback request. Create leaves the field unset (legacy records already did);
   `stampEmpty: true` writes `false` only when the inbox is empty. A leftover
   `true` with an empty inbox is healed by clearing, then restoring `true` if a
   concurrent append landed. `writePendingInboxFlag(false)` still refuses to
   clobber `true`, so a probe that did not go through that heal path cannot hide
   a waiting message.

The sweep's response carries `deferred` and `alertsSkipped` so the saving is observable from the
scheduler's own logs rather than inferred from a read count.

It also carries `stalledCauses`, which is not about cost. `feedback_undelivered` exists to say
"the relay failed", and on 2026-09-12 it was firing on six rounds of which only two fit that
description: two were parked on an operator's publish decision since August, one had received a
message fourteen hours after its agent ended, and one had never had an agent connect. An alert
that cannot distinguish those is a true statement nobody can act on. The kind still fires — a
permanent false alarm is bad, silence is worse — but every stalled job now reports _why_ nothing
collected it (`uncollected-feedback.ts`), which is the difference between re-dispatching a round,
publishing it, and closing it. `agentEndedAt` alone does **not** mean the agent left — it is also
set when an agent submits without calling `end`, and `isAgentSessionEnded` (platform/) is the one
place that rule lives, shared with `shouldSteerFeedbackViaInbox` so the two cannot drift. The
cause goes in the log and the response rather than the notification body, because notifications
are create-only: adding `{{detail}}` to the body would render an empty slot in every alert
already emitted.

## Measuring

```bash
infra/read-cost-report.sh        # trailing day, split by type
infra/read-cost-report.sh 7d     # a full working week

infra/recalibrate-firestore-alerts.sh      # A29/A30/A31, in each condition's own shape
```

### Per request, from the service's own logs

The type split says _which half of this document_ a regression belongs in. It does not say
which route or which collection, and until 2026-09-12 that attribution was archaeology:
correlate a per-minute read count against a request log and guess. `store/read-meter.ts`
removes the guessing. It patches the Firestore client's read entry points once
(`DocumentReference.get`, `Query.get`, `AggregateQuery.get`, `Firestore.getAll`,
`Transaction.get`/`getAll`, `WriteBatch.commit`, `runTransaction`) and tallies them into an
`AsyncLocalStorage` scope opened per request, so every response that touched Firestore logs
one line:

```
{"msg":"firestore reads","route":"/api/review/status","fsReads":4,"fsMissing":1,
 "fsCalls":3,"fsCommits":0,"fsTransactions":0,"fsPaths":{"users/*":2,"submissions":2}}
```

`fsPaths` keys are **shapes, not paths** — document ids are masked to `*`, a collection-group
query is `group:<id>`, an aggregate is `count:<shape>` — so one key aggregates every read of
that shape.

**It counts what Firestore bills, not what came back**, and the three rules there are the
whole reason the tally can be trusted as a cost attribution:

- an **absent document** counts in both `fsReads` and `fsMissing`;
- a **query that matched nothing** still counts one read — the minimum charge. This is not a
  rounding detail: `listPendingCreatorMessages` returns empty on nearly every sweep run, so
  counting it as zero would have hidden 34 reads a run in exactly the job being investigated;
- an **aggregate** counts one read per 1000 index entries matched, minimum one, so a `count()`
  over 2,500 rows is three reads rather than one.

A read that _throws_ is not tallied — the meter records after the await. So a swallowed
`PERMISSION_DENIED` (about 850/day as of 2026-09-12, logged nowhere, cost nothing) stays
invisible here; it shows only in `api/request_count` split by `response_code`.

The two questions this answers that nothing else did:

```bash
# Which route is the floor? Sum reads per route over an idle hour.
gcloud logging read 'resource.labels.service_name=gamedev-app
  AND jsonPayload.msg="firestore reads"' --project gamedevpl --freshness=1h \
  --format='value(jsonPayload.route,jsonPayload.fsReads)' |
  awk '{r[$1]+=$2} END {for (k in r) print r[k], k}' | sort -rn

# What does one poll cost, per shape?
gcloud logging read 'jsonPayload.msg="firestore reads"
  AND jsonPayload.route="/api/review/status"' --project gamedevpl --limit 5 \
  --format='value(jsonPayload.fsReads,jsonPayload.fsPaths)'
```

The split by `metric.label.type` (QUERY / LOOKUP / NOT_FOUND) is the whole point, and it
decides which half of this document the next fix belongs in. QUERY is a collection scan —
a cache window is missing or a window got dropped. LOOKUP is per-document fan-out on a
request path: the session read, or a route fetching documents by id. A flat per-minute
count with no cadence means browser tabs, not Cloud Scheduler — check the request log for
the route before going looking for a job.

## Alerting

### The floor as measured on 2026-09-12

Before the sweep fixes above, a full idle hour (09-11 13:00-19:00Z, no traffic) sat at a flat
**12.4-12.9K reads/hour** — about 300K/day with nobody using the site, six times the free tier
from nothing. The split of one such hour: QUERY ~9,300, LOOKUP ~2,390, NOT_FOUND ~780, from
~6,160 Firestore calls against ~500 HTTP requests, on a single instance. Two reads per call and
a dozen calls per request: the bill was never one fat scan, it was thousands of tiny gets.

Reading the same hour per minute shows a clean two-minute sawtooth — odd minutes ~72
`BatchGetDocuments` / 47 `RunQuery` / 22 `Commit`, even minutes ~35 / 22 / 8 — which is how
`notify-sweep` was identified as a third of the floor without reading any code. Whole days over
the same week ran 445K-835K reads, and writes 1.1K-28K (2026-09-07 hit 22.6K creates, over the
20K/day free write quota for that day alone).

One spike is not a regression: the nightly scorecard sweep adds **~22K QUERY in the 04:00Z
hour** (31.7K against a 9.4K baseline), almost all of it one shape —
`COLLECTION /telemetry/*/playEvents LIMIT 5000`, 28 executions for a 28-day window, 23,472
reads. That is the one scan on this list whose reads buy something durable: the scorecards the
whole agent loop reasons about. It is 3% of the day and is left alone deliberately.

`infra/setup-monitoring.sh` defines **A30**, read rate sustained over ten minutes, as the
twin of A29 for writes. It is a ceiling over the floor the caches leave, calibrated to
sit well above the intended state and well below an incident. **Recalibrate it whenever
this table changes** — an alert calibrated against an old floor is an alert that no longer
fires for a regression the size of the one it was written for.

Rate alone is not enough. A30 evaluates a rate in two windows (ten minutes for a spike,
three hours for drift), and both are blind to the shape that actually produced the 2026-09
bill: a regression that adds a couple of reads a second, never peaks, and never stops. So
`setup-monitoring.sh` also defines **A31**, the _daily total_ — `ALIGN_DELTA` over 86400s
with `REDUCE_SUM`, firing above **600K reads in the trailing day**, roughly 1.6× the
~364K/day pace measured on 2026-09-08 and well under the ~800K/day the incident billed. It
is the slowest signal in the file on purpose: if it fires while A30 stayed quiet, nothing
spiked — something got permanently more expensive per request, so compare the day against
the previous week to find the step change and match it to a deploy. Both thresholds are
calibrated against a floor the badge fix above removes; **re-derive them together** from a
full working week of post-fix numbers rather than from an estimate — `read-cost-report.sh`
is what that measurement looks like, and the type split belongs in the PR that moves a
threshold.

**The deploy gate has no voice of its own.** `Deploy to Cloud Run` triggers on `workflow_run`
of CI and is gated on that run concluding success, so a red master skips every deploy while
each merged pull request still reads green. On 2026-09-12 master was red from a direct push
and two merges deployed nothing; production served the previous revision for over an hour with
nothing reporting it. `infra/check-deploy-freshness.mjs` (run every half hour by
`.github/workflows/deploy-watchdog.yml`) now asks whether master's newest settled commit has a
_successful_ deploy run, and opens one issue when it does not.

Four answers, because three of them are not "fine": **deployed** (0) closes the issue,
**not deployed** (1) opens or comments on it, **too early to judge** (3) touches nothing, and
**the check itself broke** (2) fails the workflow loudly rather than reporting a production
incident that may not exist. The distinction between 0 and 3 is the one that matters: a
watchdog that treats "still deploying" as health closes its own incident thirty seconds after
raising it.

Three rules the first draft got wrong, all three found in review:

- **Judge only the newest settled CI run.** Scanning backwards for the newest run _older than
  the grace window_ picks a superseded red commit while the green one that fixed it is still
  building — so the alarm stays on through the recovery it is supposed to notice ending.
- **Look for a deploy before judging CI.** `deploy.yml` also accepts `workflow_dispatch`, with
  no CI gate, so a manual deploy of a red-CI commit is a real deploy and must read as one.
- **A pending deploy expires.** Any in-flight run counted as health meant a queued or hung
  deploy looked fine for as long as it hung; past `DEPLOY_TIMEOUT_MINUTES` it is a stall.

**Owed after the sweep fixes land.** A30 and A31 are calibrated against the pre-fix floor
described above. Give the change a full working week in production, then re-derive both from
`infra/read-cost-report.sh 7d` and the per-route sums from the read meter, and put the type
split in the PR that moves either threshold. Do not move them from the estimate.

The fixes went live on 2026-09-12, so **the earliest honest re-derivation is the week ending
2026-09-19**. Nothing before that is a working week of post-fix traffic, and a threshold moved
from one weekend's numbers is the same estimate the paragraph above forbids, just with a
measurement attached.

`read-cost-report.sh` could not actually be run at the window it documents. It passed each
Monitoring page to `node` as a command-line argument, and a week of per-minute `DELTA` points
is megabytes, so `7d` exited with `Argument list too long` before node started — `1d` fit and
hid it. Pages now go through a temp file. The lesson generalises: a tool whose only real use is
one large window should be exercised at that window, because the small one is not a smaller
version of the same code path.

## The nightly sweep read the same days twenty-eight times

The scorecard sweep is not a poll, so none of the windows above touch it, and it was the
single largest read on the project outside the status poll: **24,186 document reads in the
03:20 minute**, measured 2026-09-15. That is 40.3 reads/s over A30's 600-second bucket,
which is exactly the 40.63 maximum the alert had been calibrated against — the "spike" the
threshold was sized for was this job.

The cause is not traffic. `SCORECARD_WINDOW_DAYS` is 28, and the sweep scanned all 28 raw
`telemetry/{date}/playEvents` partitions every night under a 50,000-document budget. A day's
partition was therefore read about 28 times over its life, and 27 of those reads returned
data that could no longer change.

The fix is a rollup, not a cache: `telemetryDaily/{date}` holds one document per day with
every game played that day, written the first time the sweep sees the day. A day older than
`SEAL_LAG_DAYS` is **sealed** and read back as one document forever after; today and
yesterday stay open and are rescanned, so telemetry that flushed late is still picked up. In
the steady state the 28-day window costs 26 document reads and two partition scans.

Two properties make that safe to do to a number an agent acts on:

- **The counters are exact.** Sessions, bounces, ticks, outcomes and totals are sums, and
  sums of per-day sums are the same number.
- **The medians are exact until a day gets big.** Each day keeps up to
  `MAX_SAMPLES_PER_METRIC` values per metric, evenly spaced through that day's sorted
  values, plus the count they stand for. Merging takes the weighted median, which reduces to
  the plain median when no day was downsampled. `telemetry-daily.test.ts` asserts the merged
  rows equal a straight scan over the same events.
- **The sample budget is spent on games, not on depth.** A day document has a fixed total
  (`MAX_SAMPLE_VALUES_PER_DAY`) shared across every game that played, so a catalog-wide day
  shortens each game's sample set instead of dropping the quiet games off the end. Past the
  hard `MAX_GAMES_PER_DAY` ceiling the day sets `gamesTruncated`, which the sweep folds into
  `window.truncated` — a dropped game is never reported as a complete window.
- **The top lists are reranked, not inherited.** The rollup stores `MAX_TALLY_ROWS` errors
  and labels per day, well past the five and eight a scorecard reports, so an error that
  ranks sixth every single day still wins the 28-day window. Merging the reported top-N of
  each day would have lost it.

The midnight seam needs care, and the naive version of this is worse than it looks. Events
are bucketed by event time on the write path, so a session running across UTC midnight
leaves a tail in the next partition: no `game_opened`, and whatever it did after 00:00.
Summed as if it were its own session, that tail is a fresh visit that played for nothing
and bounced. A player who finished a game at 00:00:10 would turn one completed session
into two, one of them a bounce — halving the finish rate and the median play time on a
number an agent acts on.

So the rollup joins it rather than tolerating it. A session with no open whose first
event lands within `CONTINUATION_GRACE_MS` of the partition start is a **continuation**:
it is dropped from its own day entirely, and absorbed whole by the day that opened it.
That costs nothing extra to read, because the walk runs newest first and the sweep is
already scanning the next partition when it builds the previous one — a day is only
sealed on a run where its successor was scanned, which is what makes the join always
available.

The result is that a session is summarized in exactly one place, with all its play time,
its score, its labels, its zone rungs and its ending, so every session-derived number
matches a whole-window scan rather than approximating it. Tests assert `toEqual` against
that scan for the seam cases, not a tolerance.

The grace window is what keeps it honest in the other direction: wide enough for a late
flush, narrow enough that a session whose open was simply dropped at two in the afternoon
is still counted as the session it is.

One consequence is deliberate and worth stating. A session is counted on the day it
opened, so the tail at the very start of the **oldest** day in a window belongs to the day
before it — which is outside the window. A straight scan of the same partitions would have
counted that fragment as a session of its own; the rollup does not. That is the same
distortion the seam fix exists to remove, and fixing it only at the window edge would mean
storing boundary session state in every day's document to serve one partial session out of
twenty-eight days. The rule "a session belongs to the day it opened" is worth more than
parity with a scan that was itself approximating.

The failure path is not deliberate and is handled. If a day's rollup write fails while its
successor's succeeded, the next sweep would rebuild that day with no tail in hand and seal
a finished session as a bounce — permanently, since sealing is once. So when a day needs
rebuilding and its successor came from a rollup rather than a scan, the successor is read
back for the tail. One extra scan beats a wrong number that never expires.

Same day, same logs: `/api/me/studio/health` was running 1,500–2,000 reads a minute for the
same structural reason, one telemetry query per (day, slug) with no window at all. It is in
the table above now.

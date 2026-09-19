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

| Surface                     | Poll                        | Window                   | Dropped by                                                                                                         |
| --------------------------- | --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `/api/catalog` enrichment   | —                           | 10 min                   | writing an enrichment (`catalog-enricher.ts`)                                                                      |
| store catalog + media       | —                           | 10 min                   | publishing a game (`catalog-routes.ts`)                                                                            |
| notify sweep health scan    | 2 min                       | 10 min                   | recording a verdict (`notify-sweep-routes.ts`)                                                                     |
| notify sweep per-job derive | 2 min                       | 0/10/60 min by stillness | a move, a status change, uncollected feedback (`sweep-cadence.ts`)                                                 |
| `/api/review/status` badge  | 2 min                       | 10 min                   | the reviewer's own verdict; an operator's sweep change or requeue (`review-queue-cache.ts`)                        |
| `/api/notifications` bell   | 1 min                       | 5 min                    | creating, reading or clearing a notification (`notification-cache.ts`)                                             |
| Studio connect guide        | 10 s                        | —                        | reads one document by id; cadence widens instead (`LocalActivityStatus.tsx`)                                       |
| Studio health scan          | mount                       | 10 min                   | publishing or transferring a game (the slug set is in the key) (`studio-health-cache.ts`)                          |
| Derived GameAccess fallback | Studio status & slug routes | 30 s                     | ensureGameAccess, recordSettledOwner, transfer, editor add/remove, slug claim, erasure (`derived-access-cache.ts`) |

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

### Derived GameAccess, 30 seconds

Query Insights for 17–18 September put `COLLECTION /submissions WHERE slug = ?` at the
top of the day: **41,288 executions, 96,482 reads**, 2.337 documents scanned on
average. Cheap per call, enormous in volume — the signature of an uncached lookup on
a path the Studio status poll (and slug routes, transfers, editor invites, moderation)
hits through `canActOnSlug`.

`resolveGameAccess` already does the cheap thing first: a `gameAccess/{slug}` document
get. The collection query is only the fallback for games with **no canonical record**.
That set is not shrinking on its own. The GameAccess backfill left 193 slugs out
because several uids hold rounds on them, and anything that predates the model still
has no row. Promoting a quarantined slug would silently pick a winner; the fallback
stays.

The window covers **only that derived branch**. Caching the canonical get in the same
change would put every permission check in the product behind a 30-second answer, and
that is a different decision. A second resolve inside the window does not call
`listSubmissionsBySlug`; a miss, an expiry, or an invalidating write does.

The live `getGameAccess` still runs on every resolve, including the 193 quarantined
slugs this cache exists for. A miss is billed: Firestore charges a read for a get on
a missing document, and it shows up as `NOT_FOUND` in `document/read_count` — about
10k in a three-day sample. Caching the absence would remove it, and every path that
creates a canonical record already drops this window. It is left live on purpose: a
canonical record written on another instance takes effect immediately, which is the
whole point of that record. The collection scan is gone; one billed miss per call
remains.

This is an authorization answer, not a display value. `canActOnSlug` gates private
prior-round chat, so the window is **30 seconds** — the same bound as the session-user
cache — sized against a former owner reading for the length of it, not against the
saving. Writes that change authority drop the slug on the instance that served them:
`ensureGameAccess`, `recordSettledOwner`, `backfillGameAccess`, transfer accept
(`transferredAccess`), editor accept (`withEditorAdded`), editor remove / leave
(`withEditorRemoved`), membership erasure (`withMemberErased`), slug claim, and
account erasure. The residual that remains is the documented bound: **one window for
any action, including your own**, because `--max-instances 4` means invalidation on
one instance does not reach the others. On the instance that served the write, the
next resolve is live. A derived-only abandon (newest live round closed, no GameAccess
row) is not hooked and can sit until the window ends, on every instance.

### The shelf is served from its document

`/api/submissions/mine` is polled, and its source read grows with one creator's history:
`listSubmissionsByOwner` returns a document per round, and `reconcileTransferredOwnership`
then does a `getGameAccess` per record. On 2026-09-19 one creator's polls cost **680 billed
reads each** — 126 of 139 requests on that route in three hours, about 99% of its reads.
Everyone else cost under 100. Two populations, nothing between them.

That is what `shelves/{ownerUid}` was built to remove, and readers now use it. A shelf read
is a document get plus one aggregation that checks it.

Trusting a document needs a reason. Four of them here, cheapest first:

1. **Self-consistency, free.** `documentAnswersAlone` rejects a wrong `version`, a
   `truncated` document, one whose `rounds` and `sourceCount` disagree, and one built before
   `ownedCount` was recorded.
2. **One aggregation, every read — for the owner's own rounds only.** The document stores
   `ownedCount`, the size of the raw `ownerUid` query it was built from, so a single
   `count()` says whether a round **of the owner's own** appeared or vanished since. It needs
   both numbers, because `sourceCount` counts reconciled records and the two legitimately
   differ for an owner with transfers. What this count **cannot** see: a round written by a
   collaborator on a shared game, an editor added or removed, a transfer, a settlement, an
   erasure. None of those move the reader's own count. Membership, invite, transfer and
   settlement writes tombstone the affected shelves **in the same transaction** as the
   change; a round on a shared game tombstones the co-editors right after it lands; erasure
   tombstones the erased uid with its fence and its collaborators afterwards, best-effort.
   The next read falls back to source. That, plus the sampled backstop, is the guarantee;
   the count is not.
3. **Full source, one read in a hundred, per owner.** Content that changes without changing
   the count — a renamed title, a new status — needs the collapse comparison. Those reads
   hand their records to the shadow, which judges the document and rebuilds it on any
   verdict but `match` (and `truncated`, which a rebuild cannot change), and they serve
   source. This is also the **backstop for the in-transaction invalidation above**: if that
   write were ever missing — a new write path nobody hooked, a rollback revision — the stale
   document is caught within a hundred of that owner's reads per instance or by the hourly pass. That is
   the same-count stale window, and it is bounded, not zero.
4. **Every owner's first read in a process verifies**, and then every hundredth of theirs.
   The sampler counts per owner and is shared by both shelf routes, so one heavy poller
   cannot consume a quiet owner's samples and the two routes do not double the bound. It is
   still per **process**: with four Cloud Run instances behind round-robin, the worst case
   before *some* instance samples an owner is about four hundred of their reads. The bounds
   below say "a hundred of that owner's reads per instance" for that reason.

`SHELF_DOCUMENT_READS=false` turns it off. It is threaded through both deploy paths and
`infra/env-manifest.json` so a value set in the repo survives every deploy -- but it takes
effect only on a deploy or a hand `gcloud run services update`; the incident procedure in
"mirrored, and served" below has both steps.

What this costs when it is wrong: a round of the owner's own appearing or disappearing is
caught on the next read; a same-count change — content, a collaborator's round, membership,
transfer, settlement — is caught by the in-transaction tombstone on that write, and if that
write is ever missing, within a hundred of that owner's reads per instance or the hourly
pass. One exception is deliberate: account erasure tombstones the erased uid atomically with
its fence, but its collaborators' shelves are invalidated afterwards, best-effort, and a
failure there is swallowed because an erasure must never fail on a cache — so a collaborator
can keep an abandoned round as their tip for that same window. No shadow week preceded the
switch to document reads; see "mirrored, and served" below.

Measured on the gate fixture, whose owner has eight rounds:

| Route                                                 | Reads |
| ----------------------------------------------------- | ----: |
| `GET /api/submissions/mine` (first read in a process) |    22 |
| `GET /api/submissions/mine (document, steady state)`  | **2** |

Two reads: the document, and the count that checks it. Against the 553-read average that
route was serving its heaviest owner, the amortised cost including the one-in-a-hundred full
read is about **7**.

## The gate

A window in the table above is a promise the next edit can break without anyone noticing
until Query Insights a day later. The gate that keeps the rule true after the person who
wrote it has moved on is a per-route billed-read baseline, the same shape as module-size
and comment-prose: shrink freely; raising one route is a deliberate, reviewable act.

It does **not** reuse `store/read-meter.ts`. That meter patches the real
`@google-cloud/firestore` prototypes; tests never construct those classes. They run on
`InMemoryStore`, or on `FirestoreStore(fakeFirestore().db)` whose fake is a hand-rolled
object. Wired as-is, every route would measure zero and the gate would be vacuous. The
counter lives on the fake, which is the only place in the test path that materialises
gets, queries, `count()` and `getAll`.

It counts what Firestore **bills**, not what the code calls:

- a document get is 1, whether or not the document exists;
- a query is one read per document returned, **minimum 1 even when it returns nothing**;
- an aggregation (`count()`) is 1, not the number of rows it counted;
- `getAll` is one per reference requested.

The fixture is fixed-size and explicit: eight creator rounds, twelve decoy rounds, three
derived-only owner rounds, five events and three messages on the polled job, six creator
notifications, ten decoy notifications, seven reviewer assessments, fifteen decoy
assessments, four decoy re-reviews. Decoys are why removing a `where` fails the gate
instead of still passing.

Covered first, because a regression is both likely and expensive: `GET /api/submissions/:token`,
`GET /api/submissions/mine`, `GET /api/submissions/mine (derived-only owner)`,
`GET /api/review/status`, `GET /api/notifications`. The numbers are today's cost, not a
target — do not round them up.

The lint gate is at-or-under for every route: shrinks pass, raises fail. The derived-only
owner is also pinned **exact** in `firestore-read-cost.test.ts`, because that route exists
to see movement in either direction — a silent shrink is the cost curve going missing
again. The other four stay at-or-under on purpose. That looser rule already cost a
reseal: #1408 took access-row `mine` from 44 to 39, the ceiling stayed at 44, and those
five reads sat spendable until #1410 locked them by hand. Making the other four exact is
a separate decision; do not collapse the two rules without taking it.

`/api/submissions/mine` is measured three times. Two are owner shapes with different
source-path cost curves; the third is the document path that now serves the route.

The existing creator has `gameAccess` rows. The derived-only owner has three slugged
rounds and **no** `gameAccess` rows — the 193 slugs the GameAccess backfill left derived
on purpose. With no canonical slugs, every record lands in `nonCanonical`, so a source
read for that owner pays `listSubmissionsByOwner` plus a cold `resolveGameAccess` for
every slugged round (the 30s derived-access window starts empty on each measurement: a
new instance and every window expiry). That is why the two source-path numbers differ.

`countSubmissionsByOwner` is the raw `ownerUid` aggregation on both stores — one billed
read, no reconciliation. It is not a shelf comparison any more; it is the read fence's
cheap check that no round of the owner's own appeared or vanished since the document was
built, and it has to match the `ownedCount` the mirror recorded from the same raw query.
#1408 briefly made it reconcile so a shadow comparison would line up; #1416 reverted
that once the shadow took its count from the records it was handed. A transfer, an
editor change, or another member's round moves none of these counts, which is why every
write that changes a shelf's contents invalidates it in the same transaction rather than
trusting this number to notice.

The third measurement, `(document, steady state)`, is the second read in a process: the
first always verifies against source, so the existing gate route only ever measured a
source read. Steady state is **2** billed reads — the count and the document — and the
gate holds it exactly.

```bash
npm run firestore-read-cost                                            # report
npm run firestore-read-cost -- "GET /api/submissions/mine"             # access-row owner
npm run firestore-read-cost -- "derived-only"                         # derived-only owner
npm run firestore-read-cost -- "GET /api/submissions/mine" --write --force   # raise ONE
npm run firestore-read-cost -- "derived-only" --write --force          # raise the other
npm run firestore-read-cost -- --write --reseal                        # reseal every route
```

Enforce: `eslint-rules/firestore-read-cost-check.mjs` via `npm run firestore-read-cost`
(also part of `npm run lint`). Ceilings live in
[`eslint-rules/firestore-read-cost-baseline.json`](../eslint-rules/firestore-read-cost-baseline.json).
The HTTP fixture is `apps/api/src/store/firestore-read-cost.fixture.ts`
(excluded from the API compile — it is a test harness, not a production module).

**Never run `--write` unscoped.** It does not only raise the route you are fixing; it also
lowers every other ceiling to whatever that route happens to measure today. Same refusal
and `--reseal` escape as module-size.

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

**A forgotten localStorage list is occupancy with a longer memory.** The status
poll's cost was supposed to be one token per open Studio tab. On 2026-09-18 a
single Chrome session issued 1,102 of 1,120 status polls in forty minutes,
spread across **32 job tokens**, in lockstep — 29 different tokens inside the
same one-second bucket, again a minute later — until the browser closed at
17:25Z. `/submissions` was 221,334 of that day's ~280k reads. The top three
Insights rows were the same session: `WHERE slug = ?` (permission checks on
old games with no `GameAccess` record), `WHERE ownerUid = ?` (`/api/submissions/mine`
returning a 123-round shelf), `WHERE openRound = ?` (the header badge).

`loadCreatorGames` is the fan-out. It takes every token this browser ever saved
(`getSavedSpecs()`, anonymous-era localStorage), subtracts what `/mine`
returned, and `Promise.all`s `getSubmissionStatus` for the rest. Nothing wrote
the answer back: `removeSpec` had no callers, so the list only grew, and jobs
19 / 22 / 24 / 29 / 32 / 35 / 37 / 92 / 130 were asked about forever, once a
minute, from one forgotten home tab. That is the same lesson as a forgotten
Studio tab, with a different shape: **it scales with how long a browser has
been used**, not with how many creators are watching something now.

The client half stops asking. An unlisted token whose status is terminal or
missing — `abandoned`, HTTP 404, or a token the API rejects (400) — is pruned
via `removeSpec`. A settled status that is not in-flight (`published`,
`needs_changes`) is stored as `lastStatus` on the spec so the next load still
renders it and does not re-ask. **In-flight is the only remaining re-ask:** a
live round the server's shelf has not listed yet (anonymous-era, signed-out,
or a round `/mine` has not collapsed) can still move, and the Studio chip
should see that. Lengthening the 30s home poll would not have helped; the
cost is the size of the fan-out.

That remaining re-ask is also the residual. `shouldAskUnlisted` is
`isSubmissionInFlight`, true for `null` and for queued / building /
in_review / publishing. A live unlisted round is supposed to be asked again;
nothing here ages it out. Ancient jobs the notify sweep has already
auto-abandoned prune on the first answer. Rounds that stay non-terminal —
quiet `building`, parked `in_review` — keep fanning out from that browser
until they settle or the spec is cleared. Do not cap the list by age: an
age cut would hide a live anonymous round the shelf has not listed yet,
which is the case this list exists for. Measure after deploy. If the
remaining fan-out is still the day's hottest query, that is a new
decision, not this one. The derived `listSubmissionsBySlug` fallback
those polls still take is a separate cache, not this change.

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

### The shelf itself: mirrored, and served

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

**Three consistency layers, because no single one is enough.** Submissions carry no
`updatedAt`, and until the guard below there was no write chokepoint to hook either:
`createSubmission`, `recordJobTransition`, the two status setters, `publishedAt`,
`abandonedAt`, the slug/title/version setters and the erase path's `ownerUid` reassignment all
write directly:

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

2. **A count on read, and invalidation on write.** The document stores `ownedCount`; the
   reader spends one `count()` aggregate against the raw `ownerUid` query and falls back to
   source on disagreement. That catches the owner's own rounds appearing or vanishing and
   **nothing else** — not a collaborator's round, not a membership, transfer, settlement or
   erasure, none of which move the reader's count. Those are handled where they happen: the
   membership, invite, transfer, settlement and erasure transactions each tombstone the
   shelves they change, and a round written on a shared game tombstones the co-editors. A
   tombstone is a document with `stale: true` and a bumped `seq`; it is never a delete,
   because a delete resets the sequence a stale in-flight rebuild may still hold. It cannot
   catch an in-place field update, which is why there is a third layer.
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

### The guard: why "a writer nobody hooked" is no longer a category

Layer 1 says "every shelf-relevant writer rebuilds". Nine review findings on #1416 were nine
places where that sentence was false, and each was invisible: the stale document stayed
self-consistent, the reader's `count()` still agreed, and nothing surfaced until a sampled
read or the hourly pass. Enumerating the write sites afterwards turned up two more —
`claimSeal`, which moves a round's `state`, and `ensureGameAccess`/`backfillGameAccess`, which
drop a slug from every rival claimant's shelf by creating canonical access for somebody else.
A list of writers that has to be kept correct by hand is not a consistency layer.

So invalidation is structural now, at the two seams that exist:

- **In memory**, every slice shares one `Map<number, SubmissionRecord>` by reference.
  `GuardedSubmissions` is that map; its `set`/`delete` diff the mirrored fields and tombstone
  the affected owners. `GuardedGameAccess` does the same for the access map, where every write
  is shelf-visible because membership is exactly what the reader's count cannot see. A slice
  added later inherits this without knowing the shelf exists.
- **In Firestore**, `FirestoreStore` hands every slice a `GuardedFirestore` — a branded
  `Firestore` whose `runTransaction` supplies a transaction that remembers which
  `submissions` and `gameAccess` documents it read, and tombstones the shelves its writes can
  be seen on before the transaction commits. A slice that declares a bare `Firestore` does not
  type-check, which is the actual guarantee; the `gamedev/shelf-invalidation` lint rule covers
  only what a type cannot, a write made outside any transaction.

Two properties make this affordable. Resolving owners costs **no extra read**, because they
come from documents the transaction had already read for its own sake. And the tombstone is a
**blind write**: `seq: FieldValue.increment(1)` needs no read of the current sequence, so it
can be issued after the transaction's writes have begun. Tombstoning rather than rebuilding is
deliberate — a rebuild costs a full source read per write, a tombstone costs one small write
and collapses repeated writes between two reads. Never a delete: a delete resets `seq` to 0,
which an in-flight rebuild may also hold, so its stale write then wins the compare-and-set.
That bug was introduced three separate times during #1416 review.

What the guard does not do: expand a shared game's co-editors on an ordinary round write. That
stays `shelfMirror.afterJobWrite`'s job, because doing it at the seam would mean a `gameAccess`
read on every round write. A `gameAccess` write does expand — including a post-commit query for
rival claimants of the slug, which is rare enough to pay for.

Staleness, stated: immediate on every instance for a hooked writer; for a writer nobody
hooked or a rollback revision, **within a hundred of that owner's reads per instance or one hour**,
whichever comes first — the same-count stale window.

**Readers serve the document.** They were pointed at it on 2026-09-19 without the week of
mismatch-free shadow this section originally required; the owner chose not to phase the
rollout, and the review that replaced the week found and fixed the invalidation gaps the
shadow would have surfaced. The shadow remains as the repair path: every sampled or
fallen-back read still loads the document, judges it against what source returned, annotates
its `firestore reads` line with `shelfShadow` (and `shelfMismatch` on disagreement), and
rebuilds on any verdict but `match` or `truncated`. The comparison is on the **collapsed**
output, so a difference the collapse would have hidden is not reported as drift, and
`absent` / `stale` / `version` / `truncated` / `count` / `collapse` are distinguished. A
concurrent rebuild losing the compare-and-set retries from the new sequence rather than
trusting the winner, and gives up into a tombstone rather than leaving a document it could
not order itself against.

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
Readers were flipped before that measurement was taken, so it has to be made live: sum
`route=/api/submissions/mine` against the write path in the meter over a real week. If write
amplification exceeds the read it saves, the right answer is `SHELF_DOCUMENT_READS=false`
and then to delete the document. Flipping it is **not** free of a deploy: the value is baked
into the Cloud Run revision at deploy time, so setting the repo variable alone changes
nothing until the next rollout. In an incident, set it by hand for immediate effect
(`gcloud run services update gamedev-app --region=europe-west1
--update-env-vars=SHELF_DOCUMENT_READS=false`) **and** set the repo variable so a later
deploy does not silently switch it back on -- a hand-set lever alone evaporates on the next
deploy, which is the incident shape the env-manifest gate exists to prevent.

Two steps are not the whole procedure, because a deploy **already running** when you set
the variable read `vars.SHELF_DOCUMENT_READS` at job start and still holds `true`; deploys
do not cancel each other (`concurrency` in `.github/workflows/deploy.yml`), and that run's
candidate promotion will put a `true` revision back in front of traffic -- including over a
hand update made before it finished. So, in order: (1) **cancel or wait out every in-flight
deploy** in Actions first; (2) hand update for immediate effect; (3) set the repo variable;
(4) start a fresh deploy so the durable value ships; (5) verify the *served* revision, not
the workflow. If you made the hand update before draining because seconds mattered, repeat
it after the last old run has stopped and before step (4). Verification, proven against a
live revision on 2026-09-19 (the Revision resource keeps `containers` directly under
`spec`; the Service-shaped `spec.template.spec.containers` path prints `null`):

```bash
REV=$(gcloud run services describe gamedev-app --region=europe-west1 --format='value(status.traffic[0].revisionName)')
gcloud run revisions describe "$REV" --region=europe-west1 --format='yaml(spec.containers[0].env)' | grep -A1 SHELF_DOCUMENT_READS
```

A `shelfOrigin=document` line in the request logs after that is the switch not having
taken.

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

That was the plan of record when this section was written: keep readers on source and
graduate them only after a week of shadow logs showed zero mismatches split by verdict, in a
change separate from the one that hooked the writers, so the flip had its own revert. It did
not happen that way. Readers were pointed at the document on 2026-09-19 in the same PR, by
the owner's decision, and the invalidation gaps that week would have surfaced were found in
review instead — see "mirrored, and served" above for the model that shipped. The revert is
now the kill switch, and its procedure is written there.

Dropping the `count()` early-exit looked like it would make the polled path more expensive.
Measured against the read-cost gate (#1409) on this change, `GET /api/submissions/mine`
goes **44 → 39**: the old pre-check queried `listGameAccessByMember` and then
`reconcileTransferredOwnership` queried it again. Whoever merges this and #1409 second
should run `npm run firestore-read-cost -- "GET /api/submissions/mine" --write --force`
so those five reads stay locked.

That fixture's creator has `gameAccess` rows, so it cannot see an owner with none — the
derived-only accounts the access backfill left. `GET /api/submissions/mine (derived-only
owner)` is that shape: three slugged rounds, no `gameAccess` rows, measured cold so the
gate watches the per-round `resolveGameAccess` curve. Do not treat a raise of that
ceiling as the same decision as a raise of the access-row `mine` poll.

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

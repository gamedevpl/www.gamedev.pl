# Moderation rejection burst (A14), and acting on a report

**Last drilled: never.**

Two things bring you here: alert **A14** fired, or a player reported a published game. They
share a page because they share a decision — _does something come down, and how fast._

Note the asymmetry between the two halves: A14 arrives as an alert and can wait for a
diagnosis, while a report arrives as an email from a person who is owed a reply on a legal
clock. Do not let the more interesting problem crowd out the one with a deadline.

Project `gamedevpl`, app service `gamedev-app`, region `europe-west1`.

---

## Part 1 — A14 fired

A14 means moderation rejected far more content than organic traffic explains. **Two very
different faults produce the identical alert**, so the first job is telling them apart
rather than reacting:

| What you'll see                   | What it is                                              | Urgency                             |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| One uid, many categories          | A person walking the deny-list                          | Low — the wall is holding           |
| One uid, one category, high count | A bot, or someone retrying one blocked phrase           | Low                                 |
| **Many uids, one category**       | **The deny-list is rejecting valid input**              | **High — this is user-facing harm** |
| Many uids, many categories        | A checker regression, or a Vertex outage failing closed | **High**                            |

The counter-intuitive one is the third row, and it is why this alert is worth having.
Somebody probing the walls is the system _working_ — nothing gets through, and it can wait
until morning. A false-positive regression is silently refusing legitimate creators, and
every minute of it is a person concluding the site is broken and leaving. **Assume the
worse case until the data says otherwise.**

### 1. Get the breakdown

```bash
gcloud logging read \
  'resource.labels.service_name="gamedev-app" AND jsonPayload.msg="moderation rejected"' \
  --project gamedevpl --limit 200 --freshness 2h \
  --format 'value(jsonPayload.moderation.uid,jsonPayload.moderation.category,jsonPayload.moderation.surface)' \
  | sort | uniq -c | sort -rn
```

The distinct-uid count is the whole diagnosis:

```bash
gcloud logging read \
  'resource.labels.service_name="gamedev-app" AND jsonPayload.msg="moderation rejected"' \
  --project gamedevpl --limit 500 --freshness 2h \
  --format 'value(jsonPayload.moderation.uid)' | sort -u | wc -l
```

**The logs do not contain the rejected text, deliberately** — see
`apps/api/src/telemetry/moderation-metrics.ts`. So you cannot read what was submitted, only what it
was classified as. If you need the text to judge a false positive, ask the affected creator;
do not add text logging in the middle of an incident.

### 2a. If it is a probe (few uids)

Nothing is getting through — the layers did their job. Options, cheapest first.

**Block the account.** `tier: 'blocked'` is enforced everywhere that spends quota
(submissions, refine, feedback, worlds, saves) and takes effect on the account's next
request, with no redeploy. Note honestly that **no tool writes it** — there is no admin route
and no script, so today this is a manual edit:

```bash
# Find them, then set tier by hand in the Console (Firestore → users → <uid>).
gcloud firestore documents describe "users/<uid>" --database='(default)' --project gamedevpl
```

That gap is worth knowing before an incident rather than during one: if you need to block
someone at 2am you will be clicking through the Console, so do not plan around a CLI that
does not exist.

If the volume is also costing money, the global circuit-breaker is the bigger hammer and
stops **everyone**:

```bash
curl -X POST https://www.gamedev.pl/api/admin/creation-limits \
  -H 'content-type: application/json' -H "authorization: Bearer $ADMIN_TOKEN" \
  -d '{"paused":true}'
```

Only reach for that if creation itself is the problem. It is visible to every creator.

### 2b. If it is a false-positive regression (many uids)

This is an outage of the submission path wearing a different hat. Order matters:

1. **Was there a deploy?** `gcloud run revisions list --service gamedev-app --region europe-west1 --project gamedevpl --limit 5`.
   If the burst starts at a revision, [`rollback-deploy.md`](./rollback-deploy.md) is the
   fastest fix and you can diagnose afterwards.
2. **Is Vertex failing?** The LLM checker **fails closed** — an API error or timeout
   rejects with category `other` (`moderation.ts`). So a Vertex outage looks exactly like a
   wave of abuse in category `other`. Check:
   ```bash
   gcloud logging read \
     'resource.labels.service_name="gamedev-app" AND severity>=WARNING AND textPayload:"vertex"' \
     --project gamedevpl --limit 20 --freshness 2h
   ```
   Fail-closed is the right default and is **not** to be changed under pressure: failing
   open means unmoderated content reaches an agent and possibly the catalog. If Vertex is
   down and staying down, the honest move is to say so on the site, not to open the wall.
3. **Is it one term?** If the category is consistent and the surface is `contact` or
   `world_text`, suspect a deny-list term matching an innocent Polish or English word. Fix
   in `moderation-terms.ts` with a test; it is a normal deploy, not an incident hotfix.

### 3. Close the loop

Record what it was in the incident log. If A14 fired on organic traffic, the threshold is
wrong — raise it in `infra/setup-monitoring.sh` and re-run. An alert that cries wolf once is
an alert the operator will ignore next time, and that is a slower failure than no alert.

---

## Part 2 — A player reported a game

**Reports arrive as email to `admin@gamedev.pl`**, not in a queue. The in-player Report
button ([`ReportGameButton.tsx`](../../apps/web/src/ReportGameButton.tsx)) is a `mailto:`
pre-filled with the four things DSA art. 16 requires a notice to contain — what is illegal,
where, who is reporting, and a good-faith statement — because a notice that lacks them does
not oblige us to act, and an empty compose window produces exactly that.

Two operational consequences of it being email, and both matter more than they look:

- **There is no dashboard, so there is no "unread" state.** If the inbox is not read,
  nothing anywhere reflects that a report exists. Check it deliberately.
- **Receipt confirmation and the statement of reasons (art. 17) are manual.** Art. 16 wants
  a confirmation of receipt sent; a mailto cannot send one. Reply to the reporter. The
  in-product form that automates both is Phase 2 of the legal-compliance plan in the private
  ops repo, and it is deliberately sequenced _after_ counsel's review — the confirmation and
  statement-of-reasons wording are legally operative text, not UI copy.

A report is **a signal, not a verdict** — one report is one person's opinion, and reporters
self-select their reasons. Read the notice, then play the game. The whole point of the
sandboxed player is that you can.

### Taking a game down

There is no "unpublish" button, and that is the honest state of things. Removal today is a
games-repo change followed by a bake:

1. Remove the game directory from `main` (or flip its `SPEC.md` status), which drops it
   from the catalog server-side.
2. **Confirm a green bake followed.** This is the step that actually matters: published play
   is served from the snapshot bucket, so the game stays playable at its permalink until a
   bake replaces the snapshot. The nightly bake bounds this at ~a day, which is far too slow
   for anything urgent.
   ```bash
   gcloud storage cat gs://gamedevpl-games-snapshots/current.json --project gamedevpl | jq .
   ```
   Compare the pointer's timestamp against your merge. If it predates the removal, the game
   is still being served — trigger `publish-games.yml` manually and wait for it.

**Takedown latency is a known gap**, tracked in the private ops repo's readiness plan and
addressed by the games-store migration (publication becomes a registry flag, so a takedown
is a flag flip plus a re-bake rather than a merge plus a bake). Until that lands, budget an
hour and verify the pointer rather than trusting the merge.

### If the content is illegal rather than merely bad

Different clock and a different procedure: this is a DSA/UŚUDE obligation, not a moderation
preference. Take it down first by the steps above, then follow the legal-compliance plan in
the ops repo — including the notification duties, which have deadlines that a "we'll get to
it" does not satisfy.

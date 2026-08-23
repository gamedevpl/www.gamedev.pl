# Runbooks

Procedures for when something is broken, or before it is. Written to be followed by
whoever is holding the pager — which today is one person, possibly at an inconvenient
hour, possibly on a phone.

**Rules for this folder:**

1. **Commands, not prose.** Copy-pasteable, with the project/region already filled in.
2. **A runbook is not done until it has been executed once** while nothing was wrong.
   Each file carries a "Last drilled" line; `never` means it is an untested hypothesis.
3. **Fix them when they turn out to be wrong** — same self-improvement clause as the
   agent playbooks. A runbook that lies during an incident is worse than no runbook.

| Runbook                                          | When                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [`site-down-triage.md`](./site-down-triage.md)   | Alert A1 or A2 fired, or the site is unreachable. **Start here**                                    |
| [`zones-down-triage.md`](./zones-down-triage.md) | Alert A6 or A7 fired — shared worlds are failing while the site looks fine                          |
| [`rollback-deploy.md`](./rollback-deploy.md)     | A deploy broke production                                                                           |
| [`restore-firestore.md`](./restore-firestore.md) | Data was lost, corrupted, or wrongly deleted                                                        |
| [`rotate-secrets.md`](./rotate-secrets.md)       | Routine rotation, an expiring PAT, or a suspected leak. The expiry ledger itself is in the ops repo |
| [`moderation-burst.md`](./moderation-burst.md)   | Alert A14 fired, or a player reported a published game                                              |

Planned, not yet written: `event-mode.md` (pre-warm before a meetup or launch spike) and
`launch-day.md` (the spike procedure). Both are Gate O2/O3 items.

## Alerts and where they land

Provisioned by [`infra/setup-monitoring.sh`](../../infra/setup-monitoring.sh).

| #   | Policy name                                           | Fires when                                                                  | Go to                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| A1  | `A1 <service> site down (uptime check failing)`       | That service's uptime check fails from most probers for 5 min               | [`site-down-triage.md`](./site-down-triage.md)   |
| A2  | `A2 <service> Cloud Run 5xx rate elevated`            | That service's Cloud Run 5xx sustained over 10 min                          | [`site-down-triage.md`](./site-down-triage.md)   |
| A3  | `A3 notify-sweep failing`                             | >2 failed Cloud Scheduler attempts in 15 min, any job (log-based)           | §below                                           |
| A4  | `A4 no successful Firestore export`                   | No successful export logged in 23h30m (inert until the first one)           | [`restore-firestore.md`](./restore-firestore.md) |
| A5  | (billing budget, created by hand)                     | Billing budget at 50 / 90 / 100%                                            | Cost review — see the ops repo's readiness plan  |
| A6  | `A6 zone admission failing`                           | The zone host could not start a zone (log-based, rate-limited to hourly)    | [`zones-down-triage.md`](./zones-down-triage.md) |
| A7  | `A7 world service 5xx rate elevated`                  | `gamedev-world` 5xx sustained over 10 min                                   | [`zones-down-triage.md`](./zones-down-triage.md) |
| A14 | `A14 moderation rejection burst`                      | >60 moderation rejections in 10 min on `gamedev-app` (log-based)            | [`moderation-burst.md`](./moderation-burst.md)   |
| A23 | `A23 seeded builds cannot place their drafts`         | >1 seed staging failure in an hour (log-based)                              | §Vertex spend below                              |
| A24 | `A24 Vertex call volume abnormally high`              | Vertex calls >0.25/s sustained 10 min, project-wide                         | §Vertex spend below                              |
| A25 | `A25 Vertex output token rate abnormally high`        | Vertex output tokens >300/s sustained 10 min, project-wide                  | §Vertex spend below                              |
| A27 | `A27 typecheck preflight budget chronically exceeded` | >2 preflight skips (budget exceeded) in 30 min on `gamedev-app` (log-based) | §below                                           |
| A28 | `A28 gate build died without a verdict`               | Any gate build finishes without writing a verdict (log-based)               | §Gate crashes below                              |

**A1 and A2 name the service; the rest do not.** A1/A2 exist once per Cloud Run service
answering requests (`gamedev-app`, and the party relay when it takes traffic), so the
policy name tells you _which_ service is down before you open anything — and A1's
condition is scoped to that service's own uptime check rather than to "any check in the
project". Each such service needs its own `SERVICE=… ./infra/setup-monitoring.sh` run or
it has no A1/A2 at all. A3/A4 watch project-wide Cloud Scheduler jobs and A6/A7 name
`gamedev-world` directly, so there is exactly one of each and they are written only on the
primary run.

**A3 and A4 are log-based, because Cloud Scheduler emits no metrics here.** The first
real run of `setup-monitoring.sh` failed on `cloudscheduler.googleapis.com/job/attempt_count`;
a sweep of every metric descriptor visible to the project found no `cloudscheduler.*` metric
at all, so the original A3/A4 were unarmed by construction. Both now count log entries
(`resource.type="cloud_scheduler_job"`) through the log-based metrics
`scheduler_job_errors` and `firestore_export_succeeded`.

Two consequences worth knowing before you trust either:

- **Pausing a job does not test A3.** A paused job makes no attempts, so it logs no
  failures and there is nothing to count — this was true of the metric version too, so the
  "pause notify-sweep and wait for the email" instruction that used to be here could never
  have worked. To test it, point the job at a wrong path for ~8 minutes and put it back;
  the script prints the exact commands. **Done on `notify-sweep` 2026-07-30 and it works
  end to end**: first failure 22:26:04Z, incident 22:33:52Z, email delivered — 7m48s.
- **A4 is inert until the first successful export.** An absence condition needs a time
  series that once existed, and a log-based metric with no matching entries has no series.
  It becomes real protection only after `setup-backups.sh` has run and one export has
  landed.
- **A4's window is 23h30m, and that is why the export runs twice a day.** Monitoring caps
  absence durations at 23h30m, so the 36h window this wanted is not expressible. Against a
  single daily export, any window under 24h elapses between two healthy runs and emails
  every morning; with runs 12h apart, 23h30m of silence takes two consecutive failures.
  `setup-monitoring.sh` and `setup-backups.sh` are coupled through this — reverting the
  export to daily makes A4 fire after a single miss.

**A14 is deliberately loose, and its interesting case is the inverse of its name.** The
threshold sits far above organic traffic because rejections are a working system, not a
fault — an alert on the deny-list succeeding is an alert the operator learns to delete. What
makes it worth an email is the _shape_ of a burst: a few uids across many categories is
somebody probing the walls and can wait until morning, while **many uids in one category is
the deny-list refusing legitimate creators**, which is a user-facing outage that presents as
"the site is broken" and never as an error. The runbook leads with that distinction. The
rejected text is never logged (the category is what makes a rejection actionable; the wording
would put user-authored abuse material into Cloud Logging with no erasure path), so the
diagnosis is uid and category concentration, not reading submissions.

### Vertex spend (A23, A24, A25)

**Not yet drilled.** Written after 2026-08-04, when a build-log translator on the status
endpoint made ~9,250 Vertex calls in a day and was found only because somebody opened the
billing console.

**The thing that makes this class hard: every call succeeded.** All 9,250 returned HTTP
200 and were discarded client-side at a 4s abort, so no error rate moved, no latency
moved, and nothing but the call count was ever abnormal. Do not look for failures.

**A24 and A25 are deliberately different questions.** A24 catches many cheap calls (a
retry loop); A25 catches few enormous ones — `game-seed.ts` and `code-lane.ts` both
request up to 65,536 output tokens, so a loop there would cost a fortune while barely
moving A24. If both fire it is a call loop; start with A24.

**Every call site shares one model and location**, so `model_user_id` and `location`
cannot tell you who is calling. The only discriminator is the token-size labels. This is
the query that identified the culprit — the signature was `500_TO_1K -> 500_TO_1K`:

```sh
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" --get \
  'https://monitoring.googleapis.com/v3/projects/gamedevpl/timeSeries' \
  --data-urlencode 'filter=metric.type="aiplatform.googleapis.com/publisher/online_serving/model_invocation_count"' \
  --data-urlencode "interval.startTime=$(date -u -v-6H +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode "interval.endTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode 'aggregation.alignmentPeriod=3600s' \
  --data-urlencode 'aggregation.perSeriesAligner=ALIGN_SUM' \
  | python3 -m json.tool | grep -E 'token_size|int64Value'
```

`gcloud monitoring` has no `time-series` verb — the API is the only way to read these.

Call sites, all in `apps/api/src/`: `moderation.ts`, `refine.ts`, `game-seed.ts`,
`code-lane.ts`, `editor-assist.ts`, `feedback-themes.ts`, `translate.ts`.

**Do not reach for an env-var kill switch without checking it survives a deploy.** Both
`infra/deploy-api.sh` and `.github/workflows/deploy.yml` apply `--set-env-vars`, which
replaces the whole map — a variable set by hand with `--update-env-vars` is gone at the
next deploy. On 2026-08-04 that silently reverted the fix twice. To stop spend durably,
ship the code change or add the variable to both `ENV_VARS` lists.

**Confirm a fix by watching traffic and calls together**, never by a quiet window alone:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gamedev-app" AND httpRequest.requestUrl:"/api/submissions/"' \
  --project gamedevpl --limit 500 --freshness 10m --format='value(resource.labels.revision_name)' | sort | uniq -c
```

Requests still flowing while the Vertex rate sits at zero is proof. A quiet period on its
own only proves nobody was looking.

### Typecheck preflight budget (A27)

`typecheck-preflight.ts` runs a real, in-process `tsc` pass against a round's delivered
sources before accepting them — synchronous, so it cannot be preempted mid-run. If it takes
longer than `TYPECHECK_PREFLIGHT_BUDGET_MS` (20s), the completed result is thrown away and
the delivery is accepted unvalidated instead, the same fail-open shape as every other gate
in this pipeline. One skip is unremarkable — a cold instance, a game with an unusually large
module set. A27 fires on **more than 2 in 30 minutes**, because that stops being "one heavy
round" and starts being "the budget is wrong for real games." Every skip already ships code
without the safety net, silently to the creator; this is what makes that visible at all.

Raised from 10s to 20s on 2026-08-20 after an ordinary raycaster-rendering game (7 files,
nothing pathological) ran 12.9s and got discarded. If A27 fires again, check
`jsonPayload.durationMs` against the current budget before raising it again — a budget that
keeps needing to grow might mean `tsc` itself got slower (the shared GameKit surface grew)
rather than that games got bigger.

### Gate crashes (A28)

A gate Cloud Build that runs and dies without writing `manifest.gate` or
`manifest.previewGate`. The candidate is stored, the agent believes it delivered, and
nothing will ever verify it.

**This is always our fault, by construction.** A game that merely fails its checks writes
a _red_ verdict, and `reconcileGateVerdict` moves the job on it. A red gate also exits the
build non-zero, which is why A28 is keyed on a log line from
[`apps/api/src/delivery/gate-crash.ts`](../../apps/api/src/delivery/gate-crash.ts) rather than on Cloud Build
failure — the latter fires on every legitimately failing game and would be muted within a
day. That module reads the build back only _after_ confirming no verdict exists, so a red
verdict can never be reported as a crash.

Triage:

1. Logs Explorer, `jsonPayload.msg="delivery gate crashed"`.
2. Take `jsonPayload.delivery.buildId`, then `gcloud builds log <id> --project=gamedevpl`.
3. Read what killed it _before_ the gate's own output starts.

The usual cause is the container failing before `gate:run` can execute: a workspace package
that `npm ci` symlinks but never builds (`infra/cloudbuild-gate.yaml` must run
`npm run build:packages` ahead of `gate:run`), a bad platform ref, or the `gate-runner` SA
losing a permission.

Several games tripping it at once is a full gate outage — every delivery in flight is
stuck. That is exactly what happened on 2026-08-21, when consolidating a type into
`@gamedevpl/contract` put an unbuilt package on the gate's import path and killed every run
in the project — acceptance, preview and the nightly health sweep — for nearly nine hours,
while Studio told each creator that verification simply had not started yet.

Affected rounds stay open (`transitionClosesRound` treats `gate_crashed` like `gate_red`),
so once the cause is fixed the agent only needs to deliver again. Re-gating is deliberately
never automatic: on a systemic breakage a retry doubles the bill and still tells the
creator nothing.

### Runtime levers, and which ones are real

**Setting an environment variable directly on the Cloud Run service does not stick.**
Both deploy paths apply `--set-env-vars`, which replaces the whole env map, so anything
added by hand with `--update-env-vars` disappears at the next deploy — anyone's deploy,
for any reason, with no log line saying so. On 2026-08-04 this reverted a spend-leak fix
twice; the flag was applied, worked for ten minutes, and vanished under an unrelated
release while the operator believed the incident was closed.

**A lever is real only if both deploy paths thread it.** To make one durable, set the
GitHub **repository variable** and confirm the name appears in _both_
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) and
[`infra/deploy-api.sh`](../../infra/deploy-api.sh). Threaded today:

`ADMIN_UIDS`, `REVIEWER_UIDS`, `APPLE_CLIENT_IDS`, `BETA_ALLOWED_EMAILS`, `BETA_ALLOWED_UIDS`,
`CANONICAL_HOST`, `CODE_LANE`, `EDITOR_ASSIST`, `GOOGLE_OAUTH_CLIENT_ID`,
`MCP_AUTHORIZATION_SERVERS`, `MP_RELAY_URL`, `REMIX_DEBUG`,
`TRANSLATE_BUILD_LOG`, `VAPID_*`, `VERTEX_MODEL`, `VERTEX_REGION`, `ZONE_HOST_URL`, and
the sweep audiences.

`SEED_DISPATCH` is **removed**: the variable is gone from `infra/deploy-api.sh` and
`.github/workflows/deploy.yml`, and nothing reads it. Round 0's kill switch moved to a
Firestore document instead — see below — because an env var needing a redeploy was the
wrong shape for a lever whose whole failure mode is silent.

**Which model vendor answers round 0 is also runtime-selectable, not baked into a single
env var.** `SEED_PROVIDER` still names the boot-time default, and per-vendor credentials
still live in env (`SEED_<VENDOR>_API_KEY` / `SEED_<VENDOR>_MODEL`, `SEED_MODEL` for the
always-on Vertex default) — but _which configured vendor a fresh build actually uses_ is
the `seedProviderOverride` field on the creation-limits document, same TTL and no redeploy.
See [`seed-provider-selection-plan.md`](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/seed-provider-selection-plan.md)
(private) for why.

**Everything else the code reads is a code default and cannot be changed at runtime** —
including `DAILY_*` quotas, `SEED_*_TIMEOUT_MS`, `REFINE_TIMEOUT_MS`,
`VERTEX_THINKING_LEVEL`, `VERTEX_TRANSLATE_*`, `SELF_BUILD_*`, the `*_TTL_DAYS` keys, and
`ENABLE_VERTEX_MODERATION` / `ENABLE_VERTEX_THEMES`. Do not plan an incident response
around setting one of those; ship the change instead.

**Not every emergency lever is an env var.** Several of the most important are Firestore
documents that take effect within a TTL and need no deploy at all: `remixTracePaused`, the
spend breaker, and round 0's `seedingMode` / `seedProviderOverride`, all on the
creation-limits document. Prefer those where they exist.

**A6 has no uptime check behind it, on purpose.** Probing a scale-to-zero service every
five minutes keeps an instance warm around the clock and turns `$0` at rest into roughly
`$65`/month to learn whether something nobody is using is up. A probe is traffic, and
that service bills for traffic. A6 watches a log line instead, and A7 covers the case
where the host dies before it can write one.

**A3 covers two different jobs.** Check `job_id` on the alert:

- `notify-sweep` — creators stop being notified of build transitions. The site looks
  fine, which is why this needs an alert at all. It is also a free synthetic monitor of
  auth + Firestore + the app in one request, so its failure often means something larger.
- `firestore-daily-export` — backups are failing. A4 is its counterpart: A3 fires when the job runs and fails, A4 when it stops running at all (paused, deleted, never scheduled), where there are no failures to count.

The `job_id` really is in the alert text — verified 2026-07-30, the message reads
`… Cloud Scheduler Job labels {project_id=gamedevpl, job_id=notify-sweep} is above the
threshold of 2.000 with a value of 3.000`. The two jobs also sit in **different regions**
(`notify-sweep` in `europe-west1`, `firestore-daily-export` in `europe-central2`), so a
`jobs describe` against the wrong `--location` reports the job as missing and reads like a
deleted job rather than a typo.

**A quiet A3 is not the same as a healthy A3.** The policy is `autoClose: 86400s` over a
15-minute `ALIGN_SUM` grouped by `job_id`, and while an incident is open that same group
does not notify again — so one stuck incident can leave A3 silent through a second outage
of that job for up to 24h. The grouping is what keeps this survivable: a `notify-sweep`
incident cannot mask `firestore-daily-export`, because that opens its own. Do not
"simplify" the aggregation.

**How to check whether A3 has fired, without the console.** Cloud Monitoring exposes no
incidents API, but the events are in Cloud Logging:

```bash
gcloud logging read 'log_id("monitoring.googleapis.com/ViolationOpenEventv1")' \
  --project gamedevpl --freshness=2d --format=json
```

`ViolationOpenEventv1` carries the open time, `policy_display_name`, the `job_id`, and the
observed value against the threshold; `ViolationAutoResolveEventv1` carries the close,
matched on `violation_id`. Two uses. During an incident, this is the fastest way to see
what fired and when. Before a deliberate drill, it is how you check no incident is already
open on that `job_id` — otherwise the notification is suppressed and a correctly wired
alert looks broken.

These prove the incident opened, not that mail was delivered; this project has no
`monitoring.googleapis.com/notification_channel` log, so the last link is a human reading
`admin@gamedev.pl`. And after a drill, **verify the restore by reading the job's URI back,
never by watching the alert go quiet** — the incident outlives the fix by about one
15-minute window (observed: opened 22:33:52Z, restored 22:37:05Z, still open at 22:51Z).

## What is not covered yet

The gaps are known, not forgotten — they are tracked as numbered items in the
operational readiness plan in the **private ops repo** (`www.gamedev.pl-ops`), which is
where ops planning lives now. Notably absent from this folder: takedown operations, the
load-shedding procedure, and anything about the party relay as a separate service. The
zone host is covered as of A6/A7 above.

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

Planned, not yet written: `event-mode.md` (pre-warm before a meetup or launch spike) and
`launch-day.md` (the spike procedure). Both are Gate O2/O3 items.

## Alerts and where they land

Provisioned by [`infra/setup-monitoring.sh`](../../infra/setup-monitoring.sh).

| #   | Policy name                                     | Fires when                                                               | Go to                                            |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| A1  | `A1 <service> site down (uptime check failing)` | That service's uptime check fails from most probers for 5 min            | [`site-down-triage.md`](./site-down-triage.md)   |
| A2  | `A2 <service> Cloud Run 5xx rate elevated`      | That service's Cloud Run 5xx sustained over 10 min                       | [`site-down-triage.md`](./site-down-triage.md)   |
| A3  | `A3 notify-sweep failing`                       | >2 failed Cloud Scheduler attempts in 15 min, any job (log-based)        | §below                                           |
| A4  | `A4 no successful Firestore export`             | No successful export logged in 23h30m (inert until the first one)        | [`restore-firestore.md`](./restore-firestore.md) |
| A5  | (billing budget, created by hand)               | Billing budget at 50 / 90 / 100%                                         | Cost review — see the ops repo's readiness plan  |
| A6  | `A6 zone admission failing`                     | The zone host could not start a zone (log-based, rate-limited to hourly) | [`zones-down-triage.md`](./zones-down-triage.md) |
| A7  | `A7 world service 5xx rate elevated`            | `gamedev-world` 5xx sustained over 10 min                                | [`zones-down-triage.md`](./zones-down-triage.md) |

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
  the script prints the exact commands.
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

## What is not covered yet

The gaps are known, not forgotten — they are tracked as numbered items in the
operational readiness plan in the **private ops repo** (`www.gamedev.pl-ops`), which is
where ops planning lives now. Notably absent from this folder: takedown operations, the
load-shedding procedure, and anything about the party relay as a separate service. The
zone host is covered as of A6/A7 above.

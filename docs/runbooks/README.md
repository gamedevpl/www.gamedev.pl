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

| #   | Fires when                                                               | Go to                                            |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| A1  | Uptime check on `/api/health` fails from most probers for 5 min          | [`site-down-triage.md`](./site-down-triage.md)   |
| A2  | Cloud Run 5xx sustained over 10 min                                      | [`site-down-triage.md`](./site-down-triage.md)   |
| A3  | A scheduled job fails repeatedly (notify-sweep, or the daily export)     | §below                                           |
| A4  | The daily Firestore export has not succeeded in 36h                      | [`restore-firestore.md`](./restore-firestore.md) |
| A5  | Billing budget at 50 / 90 / 100%                                         | Cost review — see the ops repo's readiness plan  |
| A6  | The zone host could not start a zone (log-based, rate-limited to hourly) | [`zones-down-triage.md`](./zones-down-triage.md) |
| A7  | `gamedev-world` 5xx sustained over 10 min                                | [`zones-down-triage.md`](./zones-down-triage.md) |

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

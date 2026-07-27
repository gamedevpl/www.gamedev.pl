# Operational readiness plan — backups, monitoring, observability

Status: v2, 2026-07-27. v2 added §3 (burst resilience) after walking a player-traffic burst
and a creator-activity burst to their concrete failure points. Research-based plan; nothing
in it is built yet unless marked ✅.

This is the operations counterpart to [`gtm-plan.md`](./gtm-plan.md). The GTM plan opens the
gates — more invites (Stage 1), public play (Stage 2), launch spikes (Show HN) — and every
one of those gates assumes the platform can take the traffic, keep the data, and tell the
operator when something breaks. Today none of that is guaranteed:
[`roadmap.md`](./roadmap.md) Phase 5 lists backups, observability, and deployment hardening
as 📋 open, and [`closed-beta-launch-plan.md`](./closed-beta-launch-plan.md) explicitly
deferred Firestore backups "until before public launch". This document is that revisit.

**The operating principle:** one operator, near-zero budget, GCP-native everything. No
Datadog, no PagerDuty, no 24/7 on-call. The bar is not "enterprise SRE"; it is *no silent
data loss, no silent outage, and a written recovery path for every plausible failure* —
proportionate to a beta whose users we can still personally apologize to, hardened in steps
that track the GTM stages.

---

## 1. What exists today (audit, 2026-07-27)

| Area | State |
| ---- | ----- |
| Delivery | ✅ Strong for the size: CI gate → candidate revision → smoke test (anon + authenticated) → traffic promotion, keyless OIDC. Rollback is *possible* (Cloud Run revisions) but undocumented and undrilled |
| Uptime signal | ⚠️ Accidental only — the Cloud Scheduler notify-sweep hits the API every 2 min and the deploy smoke probes on each push. Nobody is alerted if either starts failing |
| Metrics | ⚠️ Cloud Run defaults (request count, latency, 5xx, instances) exist but no dashboard assembles them and no alert reads them |
| Alerting | ❌ None. A 100%-5xx night is discovered at breakfast |
| Backups | ❌ None. No Firestore PITR, no exports. A bad script, a compromised credential, or a fat-fingered console delete is unrecoverable |
| Product telemetry | ✅ Genuinely good: per-game health ([`telemetry-health.ts`](../apps/api/src/telemetry-health.ts)), visit funnel, operator views behind `ADMIN_UIDS` — but it measures *games*, not the *platform* |
| Logs | ⚠️ Cloud Logging collects stdout; no log-based metrics, no alerts on error patterns |
| Cost visibility | ❌ No billing budget/alert. GTM Stage 2's stated failure mode is "a launch spike that burns the monthly budget in a day" — nothing would announce it |
| Incident response | ❌ No runbook. Knowledge lives in the owner's head and in scattered doc callouts |
| IaC / deploy hardening | ❌ Shell scripts + `cloudbuild.yaml`; actions pinned to major tags; no `environment:` protection on deploy |

### Data inventory (what a backup must cover)

| Data | Where | Replaceable? |
| ---- | ----- | ------------ |
| `users` (+ `notifications`, `pushSubscriptions`), `waitlist`, `accessTokens` | Firestore (europe-central2) | ❌ Irreplaceable — identity, consent, beta access |
| `submissions` (+ `events`, `messages`, `shots`), `usage/{uid}/counters`, `games/{slug}/votes` | Firestore | ❌ Irreplaceable — creator history, attribution, quotas, votes |
| `telemetry/{date}/…` (events, visits) | Firestore | ⚠️ Semi — losing history hurts the improvement loop but breaks nothing |
| Game sources + `SPEC.md` files | Private GitHub repo `gamedevpl/www.gamedev.pl-games` | ⚠️ GitHub is the only copy; also a *runtime* dependency (below) |
| Secrets | GCP Secret Manager | ⚠️ Recreatable with effort; rotation recipes documented in [`deployment.md`](./deployment.md) |
| Platform code | This repo + forks/clones | ✅ Effectively safe |
| DNS zone | AWS Route 53 | ⚠️ Small but critical (apex/www + Resend mail records); no exported copy |

### Single points of failure worth naming

1. **`--max-instances 1`.** Required by the in-memory multiplayer relay. It is the scaling
   ceiling for the *entire* API and also an availability fact: every deploy or instance
   restart drops all live party rooms. Accepted for beta; must fall before Stage 2 spikes
   ([`roadmap.md`](./roadmap.md) Phase 5 🔴).
2. **GitHub as runtime storage.** The catalog and every game bundle are read from the
   private games repo at request time ([`github-client.ts`](../apps/api/src/github-client.ts)
   has retries but no last-good cache). A GitHub API outage or an expired PAT takes the
   catalog and play path down with it.
3. **Expiring PATs.** `github-token` (Secret Manager) and `GAMES_REPO_TOKEN` (Actions
   secret) are fine-grained PATs with expiry dates. Expiry is a scheduled, silent outage of
   submissions and CI — currently nothing tracks the dates.
4. **The operator.** One person holds GCP owner, GitHub org admin, Route 53, and Resend.
   Runbooks are the mitigation this plan can offer; account recovery hygiene (2FA backup
   codes stored offline) is a to-do outside the repo.

---

## 2. The strategy: three gates aligned to GTM stages

Each gate is a *prerequisite* for the corresponding GTM move, phrased so it can be verified,
not vibed. Costs are noted because the budget posture is ~zero: everything in Gates O1–O2
lands in GCP free tiers or single-digit złoty per month.

### Gate O1 — before inviting anyone else (now, ~1–2 weeks; pairs with GTM Stage 0→1)

The floor: no silent data loss, no silent outage.

1. **Turn on Firestore Point-in-Time Recovery (PITR).** One command
   (`gcloud firestore databases update --enable-pitr`), 7-day window, cost is marginal
   storage on a tiny dataset. This alone converts "unrecoverable delete" into "recoverable
   within a week".
2. **Daily Firestore export to GCS.** A Cloud Scheduler job calling the managed
   `exportDocuments` API into a dedicated bucket (same EU region, 30-day lifecycle delete,
   bucket-level retention lock optional). Exports are the *escape hatch PITR is not*: they
   survive database deletion and project-level mistakes. Pennies per month at this volume.
3. **One restore drill, written down.** Restore yesterday's export into a scratch database,
   read a document back, delete the scratch. An untested backup is a hypothesis. The
   procedure becomes the first runbook (§4).
4. **Alerting floor, email channel** (Cloud Monitoring, all free tier):
   - Uptime check on `https://www.gamedev.pl/api/health` (3 regions, 1-min cadence) →
     alert on 2 consecutive failures. This is the "site is down" pager.
   - Cloud Run 5xx rate: alert when 5xx > 5% of requests over 10 min (and an absolute
     guard: > 20 5xx in 10 min, so scale-to-zero quiet hours can't hide a broken deploy).
   - Cloud Scheduler `notify-sweep` failure: ≥ 3 consecutive failed executions. The sweep
     already runs every 2 min; failing loudly makes it a free synthetic monitor of auth,
     Firestore, and the app in one.
   - Firestore export job failure (the backup watching itself).
5. **Billing budget** on project `gamedevpl` with alerts at 50/90/100% of a monthly figure
   the owner picks. This is also GTM's cost-spike tripwire.
6. **PAT expiry ledger.** Record the expiry dates of `github-token` and `GAMES_REPO_TOKEN`
   in the ops runbook and set reminders ~2 weeks ahead (calendar, or a scheduled GitHub
   issue). Rotation recipes already exist in [`deployment.md`](./deployment.md).
7. **Hygiene:** delete the unused `site-basic-auth` secret; export the Route 53 zone file
   into `infra/` (it is tiny, changes rarely, and a copy in git is a free DR asset).
8. **Global creation cap + pause switch** (from §3, Scenario C): a runtime-readable global
   submissions-per-day cap alongside the per-user quotas, and a `SUBMISSIONS_PAUSED` flag
   with an honest UX. The one O1 item that is a code change — small, and it is the cost
   circuit-breaker every later GTM move assumes exists.

**Exit check:** PITR on; an export object exists in the bucket and one restore has
succeeded; killing the service (or a forced 500) produces an email within minutes; budget
alert armed; expiry dates written down.

### Gate O2 — while Stage 1 runs (weeks 2–12; hundreds of users)

Seeing trends, catching the failures that matter to *this* product, and containing the
GitHub dependency.

1. **One Cloud Monitoring dashboard** ("gamedev-ops"): request rate and p50/p95/p99, 5xx,
   instance count (watch for the second instance that must never come while the relay is
   in-process), container CPU/memory, Firestore reads/writes, uptime-check status, current
   month spend. One page the operator glances at with coffee.
2. **Log-based metrics + alerts on the product's own failure modes** — this is where
   generic monitoring stops and *our* observability starts. The API should emit structured
   log lines (it already logs via Fastify; add explicit error-class fields where missing)
   for:
   - catalog/game fetch failures against GitHub (the runtime dependency,
     [`auth-and-usage-plan.md`](./auth-and-usage-plan.md) already flags it);
   - submission filing failures (issue creation rejected — creator-visible breakage);
   - **pipeline stalls**: a submission sitting in `issue-filed` with no agent PR after N
     hours — [`improvement-loop-plan.md`](./improvement-loop-plan.md) calls this "an
     alert, not a metric". Cheapest implementation: the existing notify-sweep already
     iterates open submissions; make it log a `stalled_submission` line the alert matches.
   - relay anomalies (room-not-found spikes — the symptom of a second instance).
3. **Blunt the GitHub runtime dependency.** In-process last-good cache for the catalog and
   assembled bundles: serve stale on GitHub 5xx/timeout, refresh in the background. This
   turns a GitHub outage from "site is empty" into "newest game is late". Small code
   change, large availability win, and it also cuts steady-state API-rate-limit exposure.
4. **Games-repo backup.** A scheduled `git clone --mirror` of the private games repo pushed
   to a GCS bucket (weekly is fine; the repo is small and append-mostly). Covers both
   GitHub-side loss and account lockout.
5. **Client-side app-shell error visibility.** Game errors are already captured via the
   bridge; errors in the *app shell* (React) are not. Wire `window.onerror`/unhandled
   rejection into the existing telemetry write path (respecting its privacy invariants —
   no URLs with tokens, no user text) so "the site is white-screening on Safari" is
   observable without a user report. Evaluate before adding any third-party (Sentry adds a
   vendor + DPA for marginal gain at this scale; decide deliberately, default no).
6. **Data retention starts to matter:** decide TTLs for `telemetry/{date}` partitions
   (e.g. raw events > 180 days summarized then deleted) and add the Timestamp field an
   `accessTokens` TTL policy needs ([`deployment.md`](./deployment.md) documents why the
   ISO-string field can't be used). Retention is also a RODO posture, not just cost.

**Exit check:** dashboard exists and has been glanced at for two weeks; a simulated GitHub
outage (revoke the PAT in a test window) leaves the catalog serving from cache; a stalled
submission fires an email; games-repo mirror object exists in GCS.

### Gate O3 — before Stage 2 / public launch spikes (months 3–6)

Surviving success. These are prerequisites for `PRIVATE_BETA=false` and for the Show
HN/Product Hunt moments, alongside the GTM plan's own gates (content-safety slice
sequencing per [`content-safety-plan.md`](./content-safety-plan.md)).

1. **Resolve the `--max-instances 1` ceiling** — the roadmap's 🔴 item. Either split the
   relay into its own single-instance service or move room state out of process
   ([`multiplayer-plan.md`](./multiplayer-plan.md) §4.6). Until this lands, every launch
   spike is capped by one container and party mode dies on every deploy.
2. **Load test the launch shape.** Script the real anonymous funnel (land → catalog →
   play → telemetry flush) at Show-HN-front-page rates against a candidate revision.
   Verify: p95 under load, Firestore write behavior of the telemetry batcher, cold-start
   storm behavior, and — after O3.1 — multi-instance correctness.
3. **Launch-day runbook** (see §4): pre-spike quota lowering (the GTM plan requires it),
   the `PRIVATE_BETA` flip and un-flip, rollback command, "who to watch" dashboard links,
   and the decision ladder for degrading gracefully (disable submissions first, play path
   last).
4. **Deployment hardening**, now that strangers are watching the repo (GTM makes the repo
   itself a marketing surface, which makes its supply chain a target):
   - `environment:` protection on the deploy job;
   - pin third-party actions to commit SHAs;
   - a drilled rollback: `gcloud run services update-traffic gamedev-app
     --to-revisions <previous>=100` executed once for real and timed.
5. **IaC for the now-stable resource set.** The roadmap's precondition ("IaC only after
   resources exist") is met. Terraform (or plain declarative scripts, but versioned) for:
   service + domain mapping, scheduler jobs, alert policies, budget, buckets, IAM. The
   payoff is not elegance — it is that the *monitoring and backup config itself* stops
   being click-ops that silently drifts or vanishes.
6. **Set explicit SLOs and write them down**, so "is it good enough to open?" is a number:
   suggested v1 — play path availability 99.5%/30d, p95 catalog < 1.5s warm, submission
   pipeline stall alert < 1% of submissions. Informal error budget: a red week pauses
   invite expansion.

**Exit check:** load test report exists; rollback drilled and timed; relay ceiling
resolved; alert policies and buckets are in code; SLO doc merged.

---

## 3. Burst resilience — two scenarios walked to the point of failure

The GTM plan is *designed to produce bursts*: every shared game link is a landing page,
party mode is physically viral, and Stage 2 aims launch spikes on purpose. So "what happens
in a burst" is not a tail risk — it is the success case. Walked concretely against the code
and config as of 2026-07-27.

### Scenario P — player burst (a shared link catches, or Show HN lands)

The whole player path runs through **one container** (`--max-instances 1`) with **default
resources** — no `--concurrency`, `--cpu`, or `--memory` flags in either deploy path, so
Cloud Run defaults apply: ~80 concurrent requests, 1 vCPU. From scale-to-zero, the first
wave eats a cold start. Then, in the order things actually break:

1. **GitHub rate-limit lockout (the first real breakage).** Catalog and every game bundle
   are fetched from the private games repo *live, per request* — [`github-client.ts`](../apps/api/src/github-client.ts)
   retries and honors `Retry-After`, but nothing caches. A fine-grained PAT has a
   5,000 req/h ceiling plus opaque secondary limits. A few hundred curious visitors
   browsing the catalog and opening games can spend that budget in minutes — after which
   **catalog and play return errors for everyone** until the window resets. A viral moment
   converts itself into a self-inflicted, hour-long outage at precisely the moment the
   growth loop was working. This coupling — *visitors × GitHub API calls* — is the single
   most burst-fragile fact in the system.
2. **Concurrency saturation.** Past ~80 concurrent requests the single instance queues
   briefly, then sheds with 429/5xx. Static assets, API calls, telemetry flushes, and
   party-mode WebSockets all compete for the same slots and the same vCPU — there is no
   CDN in front, so even the app shell's first loads are origin traffic (immutable cache
   headers only help *repeat* visitors).
3. **Party mode degrades ungracefully.** Relay frames share the saturated instance, so
   controllers lag; and any deploy or instance restart during the burst drops every live
   room. Per-connection frame caps exist ([`mp.ts`](../apps/api/src/mp.ts):
   40 frames/s, 2 KB frames) but there is no global room-count admission control.

**Resilience posture for P — protect the play path, break the GitHub coupling:**

- **Last-good catalog + bundle cache, promoted from O2 to O1-adjacent priority.** This was
  §2/O2.3 as an availability item; the burst analysis makes it the top code change overall.
  With an in-process cache serving stale-on-error and refreshing in the background, a
  burst of any size costs ~zero GitHub calls for published games, and failure mode 1
  disappears. Everything else on this list is tuning; this one removes a cliff.
- **Set resources explicitly** (O2): pick `--concurrency`, `--cpu`, `--memory` from a load
  test instead of inheriting defaults silently — likely 2 vCPU + higher concurrency once
  the cache makes requests cheap. Document *why* in the deploy script, next to the
  max-instances warning.
- **Event mode** (runbook, O2): before a planned spike or meetup — `--min-instances 1`
  (no cold start, ~pennies per day, flip back after), quotas lowered, dashboard open.
  Cheap insurance the GTM plan's launch checklist can invoke by name.
- **Load-shedding ladder, encoded not improvised** (O3): under pressure, degrade in this
  order — (a) pause creation (Scenario C's switch), (b) sample or drop telemetry writes
  (a flag the batcher respects; losing metrics beats losing play), (c) refuse new party
  rooms with an honest message (global room cap), (d) the play path goes down last.
- **CDN decision deferred to evidence** (O3): if the load test shows static serving
  saturating the instance before the API does, front assets with Cloud CDN; otherwise skip.

### Scenario C — creator burst (an invite wave, a prompt jam, press among the allowlisted)

Creation is the expensive, slow, externally-dependent path, and its only throttle today is
**per-user**: `checkAndIncrementQuota` enforces a daily cap per creator, but N invited
creators × quota = a global spend bounded only by how many people we invited. There is no
global cap, no pause switch — "lower the quotas", which the GTM plan's launch checklist
assumes, currently means *editing env vars and redeploying*. In failure order:

1. **Cost burn, silently.** Every submission is a moderation call plus an agent run — the
   dominant COGS. A burst is first of all a *budget event*, and until O1's billing alerts
   exist, nothing announces it before the invoice.
2. **The agent queue backs up and trust collapses.** Copilot capacity is fixed and slow
   (minutes per game, limited concurrency). A burst turns "building…" into hours of
   silence; creators see a quiet agent, retry, file feedback — adding load to the same
   queue. [`improvement-loop-plan.md`](./improvement-loop-plan.md) already calls a stalled
   `issue-filed` an alert; in a burst it is the *normal state* unless arrivals are shaped.
3. **GitHub secondary rate limits on rapid issue creation.** Bursty writes from one PAT
   trip abuse detection — jeopardizing the same token the play path depends on (until the
   cache lands, a creator burst can take down *play*). [`risks-and-open-questions.md`](./risks-and-open-questions.md)
   B3 flagged this for public submission; bursts make it a beta concern too.
4. **The sweep grows with the backlog.** notify-sweep iterates all open submissions every
   2 min; a large backlog makes the platform's own heartbeat heavier exactly when the
   system is busiest.

**Resilience posture for C — global backpressure, honest queueing, and a switch:**

- **Global creation controls as config, not code** (O1 — small build, do it with the
  alert floor): a global submissions-per-day cap alongside the per-user one, and a
  `SUBMISSIONS_PAUSED` flag — both readable at runtime (env or a Firestore config doc)
  so throttling is a flip, not a deploy. When the cap trips, the UX says so honestly:
  "creation demand is over capacity today — your quota is safe, come back tomorrow."
  This single item converts both failure modes 1 and 3 from incidents into policy.
- **Queue-depth visibility and honest ETAs** (O2): the sweep already knows how many
  submissions are open; surface it — to the operator as a dashboard line + alert (A13),
  to creators as "Nth in queue" instead of silence. Arrival shaping (a soft "the workshop
  is busy" gate above a threshold) beats letting everyone in and disappointing all of them.
- **Issue-creation pacing** (O2): a minimum spacing between GitHub issue creations
  (a queue drained at a safe rate) so a burst of accepted submissions never trips
  secondary limits — creators already experience creation as asynchronous, so added
  seconds are invisible.

The two scenarios fail differently and the plan should say so plainly: **a player burst
breaks availability; a creator burst breaks economics and trust.** The player posture is
*cache + shed + protect play*; the creator posture is *cap + queue + communicate*. Both
share one rule: the switch that saves you must exist — and be config — *before* the burst,
because during one, a redeploy is itself a risk (it drops every party room).

## 4. Alert catalog (target state after O2)

All email-channel, all Cloud Monitoring native. The bar for adding an alert: *would the
operator act on it within a day?* Anything else is a dashboard line, not an alert.

| # | Signal | Condition | Gate |
| - | ------ | --------- | ---- |
| A1 | Uptime check `/api/health` | 2 consecutive fails from 2+ regions | O1 |
| A2 | Cloud Run 5xx | >5% over 10 min, or >20 absolute in 10 min | O1 |
| A3 | notify-sweep executions | ≥3 consecutive failures | O1 |
| A4 | Firestore export job | any failure | O1 |
| A5 | Billing budget | 50% / 90% / 100% of monthly cap | O1 |
| A6 | Catalog/GitHub fetch errors (log metric) | sustained >0 over 15 min | O2 |
| A7 | Submission filing failure (log metric) | any occurrence | O2 |
| A8 | Stalled submission (`issue-filed`, no PR) | age > 6h | O2 |
| A9 | Instance count | >1 while relay is in-process | O2 |
| A10 | p95 latency | >2s sustained 15 min (tune after baseline) | O2 |
| A11 | GitHub API rate-limit headroom | `x-ratelimit-remaining` < 1,000 (log metric) | O2 |
| A12 | Request shedding | 429s from Cloud Run (concurrency ceiling hit) | O2 |
| A13 | Creation queue depth / global cap | open submissions > threshold, or global daily cap tripped | O2 |

Plus two *calendar* alerts that no monitoring system will fire: PAT expiries
(`github-token`, `GAMES_REPO_TOKEN`) and the annual domain/DNS renewal.

## 5. Runbooks (the bus-factor mitigation)

A new `docs/runbooks/` directory, one short file per procedure, each tested once by
actually performing it. Initial set, in priority order:

1. **Restore Firestore from backup** (PITR path and export path) — written during the O1
   drill.
2. **Roll back a bad deploy** — the two commands, plus how to confirm which revision is
   serving.
3. **Site down triage** — where the logs are, the three most likely causes (GitHub
   dependency, Firestore, bad deploy), and the degradation ladder (submissions off →
   private-beta wall up → static apology).
4. **Rotate each secret** — mostly links into [`deployment.md`](./deployment.md), which
   already has the recipes; the runbook adds the *order* and the verification step.
5. **Launch-day spike procedure** (O3) — quotas down, dashboard up, thresholds for
   flipping gates.
6. **Event mode** (O2, from §3) — pre-warm with `--min-instances 1`, lower the global
   creation cap, open the dashboard; and the reverse checklist for standing down.

Runbooks follow the repo's self-improvement clause: wrong or incomplete runbooks get fixed
by whoever hits the gap.

## 6. What we deliberately do not do (anti-goals)

- **No third-party observability stack** (Datadog, Grafana Cloud, PagerDuty, Sentry-by-default).
  Each adds a vendor, a DPA, and a bill to a platform whose entire load fits GCP free
  tiers. Revisit only if GCP-native alerting demonstrably misses incidents.
- **No 24/7 on-call theater.** One operator; email alerts with phone-level notification for
  A1/A2 only. The SLO is set so that hours-not-minutes response is acceptable.
- **No Kubernetes, no multi-region, no HA Firestore replicas.** Cloud Run + Firestore
  managed durability is the right amount of infrastructure for years yet.
- **No backup of what git already replicates** (this repo). The games repo mirror (O2.4)
  exists because that repo is private and single-homed, not out of general anxiety.
- **No metrics that nobody will read.** Every dashboard line and alert must map to an
  action; delete the ones that don't within a month of adding them.

## 7. Sequencing summary

```
Now ──────────── week 2 ─────────────────── week 12 ─────────────── month 6
   Gate O1                  Gate O2                     Gate O3
   backups + alert floor    dashboard, product alerts,  relay split, load test,
   restore drill, budget,   catalog last-good cache,    load-shed ladder, launch
   PAT ledger, global       queue visibility + pacing,  runbook, IaC, SLOs,
   creation cap + pause     games mirror, retention,    deploy hardening, CDN
   switch                   event mode, resources set   decision
   │                        │                           │
   └─ GTM: more invites     └─ GTM Stage 1 beachhead    └─ GTM Stage 2 public/spikes
```

The rule that binds this to the GTM plan: **each GTM gate opens only when the matching ops
gate has passed its exit check.** More invites need O1; the Polish beachhead runs on O2;
`PRIVATE_BETA=false` and any launch spike wait for O3.

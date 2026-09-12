# Runbook: launch day

For a planned spike — a Show HN or Product Hunt post, a meetup, press, or the day
`PRIVATE_BETA` goes to `false`. Everything here is a config change or a `gcloud` call;
nothing needs a deploy from source, because a deploy drops every live party room.

**Last drilled:** never.

## The numbers this is measured against

These are the service-level objectives the platform is run to. They exist so "is it good
enough to open?" has an answer that is not a feeling.

| Objective                  | Target                            | Where to read it                        |
| -------------------------- | --------------------------------- | --------------------------------------- |
| Play path availability     | 99.5% over 30 days                | Alert A1's uptime check, `gamedev-app`  |
| Catalog p95, warm instance | under 1.5s                        | `gamedev-ops` dashboard, `/api/catalog` |
| Submission pipeline stalls | under 1% of submissions           | `/admin` queue, alert A23               |
| 5xx rate                   | under the A2 threshold, sustained | Alert A2                                |

One operator, email alerts, phone notification on A1 and A2 only. The objectives are set
so a response measured in hours is acceptable; do not build a pager rota around them.

An informal error budget goes with them: a week that misses any of these pauses widening
the invite list until the cause is understood.

## 1. The day before

```bash
PROJECT_ID=gamedevpl; REGION=europe-west1; SERVICE=gamedev-app
```

- [ ] **Check the base is green.** Deploy history clean, no red alerts, no open incident.
- [ ] **Pre-warm.** Set a warm instance so the first arrivals do not pay a cold start:

  ```bash
  gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
    --min-instances 1
  ```

  Costs pennies a day. **Put it back to 0 when the spike is over** — the next deploy
  from source does not reset it, it is a service-level setting.

- [ ] **Lower the creation quotas** at `/admin/limits`. A spike is players, not creators;
      the expensive path should be narrow while attention is wide.
- [ ] **Open the dashboard** (`gamedev-ops`) and the operator console, and leave them open.
- [ ] **Re-read [`rollback-deploy.md`](./rollback-deploy.md)** so the command is in your
      hands, not in a tab you have to find.
- [ ] **Load test a candidate revision**, not production, and keep the report:

  ```bash
  node infra/load-test.mjs --target https://<candidate>-ew.a.run.app \
    --rate 25 --duration 120 --report docs/load-test-$(date +%F).md
  ```

  It drives the same four steps a real arrival does and prints p50/p95/p99 per step.
  Telemetry is off unless you pass `--telemetry`: it is the only writing step, and a
  candidate revision shares Firestore with production, so turning it on pushes synthetic
  visits into the real funnel. Compare the catalog p95 against the objective above; if
  the play step gives way before the API does, that is a caching problem, not a sizing
  one.

## 2. Opening the site

```bash
gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars PRIVATE_BETA=false
```

Un-flip is the same command with `PRIVATE_BETA=true`. Both take a new revision, so both
drop live party rooms — do them before the traffic, not during it.

**Closing it again in a hurry is rung 6, not this.** `anonymousPaused` raises the same
wall from the operator document, within a minute and without a revision. Use the env var
for a planned state change and the rung for an emergency; reach for this command during a
spike and you will drop every party room at the worst moment.

Before the flip is worth having, confirm the promotional slugs still play signed-out and
that `/api/health` reports the state you expect:

```bash
curl -s https://www.gamedev.pl/api/health | jq '{privateBeta, publicPlaySlugs}'
```

## 3. The load-shedding ladder

Under pressure the platform degrades in a fixed order, and the order is the point: the
play path goes down last, because a visitor who cannot play is a visitor who never came
back. Each rung is a switch, not a deploy.

Two kinds of pressure share one ladder. Rungs 1 to 3 answer load — CPU, Firestore,
rooms. Rungs 4 to 6 answer bandwidth, which is a bill rather than an outage and so is
worth spending longer on before you touch the play path.

| Rung | What it stops             | How                                                 | Propagation                        |
| ---- | ------------------------- | --------------------------------------------------- | ---------------------------------- |
| 1    | New game creation         | `/admin/limits` → pause creation                    | within the console's stated window |
| 2    | Telemetry writes          | `telemetrySampleRate` below 1                       | same                               |
| 3    | New party rooms           | `/admin/limits` → incident lanes → party hosting    | same                               |
| 4    | Preview video             | `/admin/limits` → incident lanes → preview video     | 60s (the breaker's TTL)            |
| 5    | Full-size images          | same panel → full-size images; only the 96px copy    | 60s                                |
| 6    | Visitors without an account | same panel; the beta wall, back up                | 60s                                |
| 7    | Play                      | nothing here does this; roll back or scale instead  | —                                  |

Pull them in order and stop as soon as the graphs recover. Rungs 1 and 3 to 6 are toggles
on the incident-lanes panel in the operator console, which is also where a rung the brake
pulled by itself becomes visible. Rung 2 has no console
field yet, so set it directly — it is a fraction of visits between 0 and 1, and `null`
restores the default of keeping all:

```bash
# 10% of visits, chosen per visit so funnels stay comparable.
curl -s -X POST https://www.gamedev.pl/api/admin/creation-limits \
  -H 'content-type: application/json' -b "__session=$SESSION" \
  -d '{"telemetrySampleRate":0.1}'
```

**Why sampling and not an off switch.** A sampled-out visit is dropped whole, so the
funnel's _rates_ stay honest at any rate above zero — losing a known fraction of the
metrics beats losing the ability to compare the spike against a normal day. Rate 0 is
available and drops everything.

**What rung 3 does not do.** It refuses _new_ rooms with an honest message. Rooms already
open keep playing, and the party UI stays reachable; nobody is disconnected.

**Rungs 4 and 5** are the bandwidth pair, and they are much larger than they look. A
preview video averages 714 KB and is the biggest single object we hand out; a catalog
poster served at its baked 320px width is 41 KB against 113 KB for the original. Pull
them together:

```bash
curl -s -X POST https://www.gamedev.pl/api/admin/creation-limits \
  -H 'content-type: application/json' -b "__session=$SESSION" \
  -d '{"videoPaused":true,"mediaLean":true}'
```

The catalog keeps working and looks worse. That is the trade; make it early rather than
late, because egress is billed on bytes already delivered and cannot be refunded.

Rung 5 narrows the width the client asked for **and** refuses anything that comes back
larger anyway — a store-lane game has no baked variants, so its images 503 rather than
quietly costing full size. Expect broken images for platform-built games while it is up.

**Rung 6 closes the site**, and it is the one rung that changes what a stranger sees: the
waitlist splash instead of the arcade. It is the same wall the private beta used, reached
from the operator document rather than from `PRIVATE_BETA`, so it needs no deploy and
drops no party rooms. Everyone already signed in keeps the full product. Arrivals become
a list instead of a bill.

Two differences from the beta wall it borrows. That wall leaves `/api/games/*/media/*`
public so a shared game link works, and it exempts promotional `PUBLIC_PLAY_SLUGS` so
those games play signed-out. Under the rung both close: media and a 533 KB game document
are the bandwidth it was pulled to stop. A published game also stops being marked
publicly cacheable, so a signed-in operator's own request cannot leave a copy in a shared
cache that outlives the rung.

`/api/health` reports the closure as `privateBeta: true` and an empty `publicPlaySlugs`
while it is up, which is what makes an arrival land on the waitlist splash rather than a
catalog that 401s. Check it before and after:

```bash
curl -s https://www.gamedev.pl/api/health | jq '{privateBeta, publicPlaySlugs}'
```

```bash
curl -s -X POST https://www.gamedev.pl/api/admin/creation-limits \
  -H 'content-type: application/json' -b "__session=$SESSION" \
  -d '{"anonymousPaused":true}'
```

## 3b. The rungs the budget pulls by itself

The spend brake (`infra/setup-spend-brake.sh`) subscribes to billing budgets and pulls
lanes without being asked. Its grading, from `budgetLanes` in `spend-brake.ts`:

| Budget state       | What it pauses                              |
| ------------------ | ------------------------------------------- |
| forecast over 100% | the platform agent                          |
| spent over 100%    | + round-0 seeding, the gate                 |
| spent over 125%    | + rungs 4 and 5 (video, images)             |
| spent over 150%    | everything, including rung 6 (the site closes) |

A budget measures spend so far this month, so it reacts in days. The faster path is alert
**A33**, which watches the *snapshot* bucket's egress rate (2 GiB/h) and carries
`lanes=video,media` — about two hours, not days. It is scoped to that one bucket on
purpose: A32 pages a human about every bucket, and the store bucket's normal traffic is
the coding agent reading kit files, which no serving rung reduces.

A per-service budget overrides the ladder by naming lanes in its own display name, which
is how an egress budget reaches only the bandwidth rungs:

```bash
# Name it "GCS egress lanes=video_media"; over 100% pulls exactly those two.
gcloud billing budgets update BUDGET_ID --billing-account ACCOUNT_ID \
  --notifications-rule-pubsub-topic=projects/gamedevpl/topics/spend-brake
```

Every budget must publish to that topic or it is only an email. Check which do:

```bash
gcloud billing budgets list --billing-account ACCOUNT_ID \
  --format='table(displayName, notificationsRule.pubsubTopic)'
```

## 4. If it is going wrong anyway

| Symptom                               | First move                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------- |
| 5xx climbing, no deploy in the window | Rungs 1 to 3, in order                                                     |
| 5xx climbing right after a deploy     | [`rollback-deploy.md`](./rollback-deploy.md), diagnose after               |
| Latency climbing, 5xx flat            | Instances are saturated — raise `--max-instances`, then rung 2             |
| Party mode lagging for everyone       | Rung 3, then check the relay service's own logs                            |
| A single game is failing              | Not a capacity problem — [`site-down-triage.md`](./site-down-triage.md) §3 |
| Moderation rejections spiking         | [`moderation-burst.md`](./moderation-burst.md)                             |

`--max-instances` is only raisable while the party relay is split out; the deploy path
derives it from `MP_RELAY_URL` for exactly that reason, and one process that still owns
rooms must never scale out. See [`deployment.md`](../deployment.md).

## 5. After

- [ ] `--min-instances 0` again.
- [ ] Restore the creation quotas and clear any rung you pulled.
- [ ] `telemetrySampleRate` back to `null`.
- [ ] `videoPaused`, `mediaLean`, `anonymousPaused` back to `false`. The brake never
      resumes a lane it pulled, by design — a rung left up is the failure mode here, and
      `/admin/limits` shows who set each one and when.
- [ ] Write down what actually happened, and correct this file where it was wrong.

# P3 zone host — where it runs

Status: **approved and built, 2026-07-28.** The recommendation below is what the zone
host now is: `apps/world` deploys as a separate Cloud Run service via
[`infra/deploy-world.sh`](../infra/deploy-world.sh), and §6 records what shipped against
each claim. Nothing is live until `ZONE_HOST_URL` is set on the app service; until then
admission 404s and every game plays exactly as it did.

The question, stated by §8: the API runs on Cloud Run with `--max-instances 1`,
scale-to-zero, and nothing pinned. An authoritative zone is a stateful process with a
lifetime — it holds a live sim, ticks it at 5–20 Hz while players are connected, and
must not evaporate mid-game. Where does that process live, what does it cost when
nobody is playing, and what bounds the cost when they are?

---

## 1. The shape of the workload, before any vendor

Three properties of a zone decide almost everything:

1. **A zone only needs CPU while somebody is connected.** Hibernation is not an
   optimization bolted on later — it is the contract. An empty zone snapshots to
   Firestore and stops existing as a process; `wake(state, elapsedMs, rng)` is how the
   world catches up when someone returns. So "stateful process with a lifetime"
   really means "stateful process with a lifetime _bounded by its sockets_".
2. **Instance death is survivable by design.** §8 already says it: an instance dying is
   an unscheduled hibernate. Snapshots plus an event log bound the loss to seconds, and
   the determinism gate proves resume works (`resumeFromSnapshotWithAlignment` in the
   games repo harness is the same move the host makes). We therefore do not need pinned,
   durable compute — we need compute that exists while sockets are open and dies
   politely.
3. **The whole platform's workload fits in one core for a long time.** A tick is
   metered at 8 ms p99, so one vCPU sustains on the order of a dozen zones at 10 Hz
   with room to spare, and a zone is at most 16 sockets. The scaling question is real
   but not urgent; the question that is urgent is cost at _zero_.

Property 1 has a happy consequence on Cloud Run specifically: under request-based
billing, a WebSocket connection is a long-running request, and an instance with a
request in flight has CPU allocated. **"CPU while somebody is connected" is exactly
what Cloud Run's cheapest mode already sells.** A zone host that hibernates empty
zones and closes their sockets drains itself to zero instances with no further
mechanism.

---

## 2. Options

### A — Host zones inside `gamedev-app` (the existing service)

Cheapest to build: the process already exists, already speaks WebSockets (`mp.ts`),
already holds the Firestore client, and at `--max-instances 1` there is no routing
problem to solve.

Rejected, for three reasons that compound:

- **Deploy coupling.** `gamedev-app` deploys often — every website change restarts it,
  and every restart is a forced mass-hibernate of every active zone. Party rooms accept
  this (ephemeral by design); a persistent world that stutters every time a CSS file
  ships would teach players the world is flaky. The zone host wants the opposite deploy
  cadence from the website.
- **The native addon lands in the critical image.** The production cage is
  `isolated-vm` ([p3-sim-spike.md](./p3-sim-spike.md) §2), a compiled addon with a
  history of quiet periods. Putting it in the image that serves the entire site makes
  every site deploy hostage to that build, and a bad interaction takes down browsing,
  not just zones.
- **Head-of-line pressure.** Sim ticking is steady background CPU inside a process
  whose other job is latency-sensitive request serving, sharing one instance that also
  cannot scale out (mp.ts pins it). A runaway is metered per-tick, but the blast radius
  of any miss is the whole platform.

### B — A separate `gamedev-world` Cloud Run service ← **recommended**

Same repo, same deploy tooling, its own image and its own lifecycle: min-instances 0,
max-instances 1 (to start), request-based billing, timeout raised to the 60-minute
ceiling, WebSockets only.

- **Cost at zero is zero.** No sockets → hibernated zones → no instances. The idle
  world is one Firestore document per zone (pennies per GiB-month), which is the §8
  cost model verbatim: the bill scales with concurrent play, not with how many worlds
  exist.
- **Cost while occupied is small and bounded.** Priced at europe-west1 request-based
  rates (~$0.000024/vCPU-s + ~$0.0000025/GiB-s), a 1 vCPU / 512 MiB instance costs
  ≈ **$0.09 per active hour** — an hour in which *all* concurrent zones share that
  instance. Cloud Run's free tier (180k vCPU-s/month) covers the first ~50 active
  hours each month, which at closed-beta traffic is plausibly the whole bill.
  A worst month — the instance somehow occupied 24/7 — caps at ≈ $65; §5 below is
  what stops that happening by accident.
- **Deploys are rare and graceful by construction.** The service redeploys when zone
  host code changes, not when the website does. On SIGTERM it snapshots every active
  zone inside the termination grace period and closes sockets with a `resume` reason;
  clients re-dial and the world continues — a _scheduled_ unscheduled-hibernate.
- **The routing problem stays deferred but not foreclosed.** At max-instances 1 the
  zone directory (§8's `zoneId → instance` map) is trivially the service URL. The join
  handshake already returns the host URL per zone (see the protocol), so scaling out
  later means standing up the directory and raising the cap — the wire protocol and
  the shell do not change.
- **Auth crosses origins the way §4.6 of the multiplayer plan already sketched.** The
  service runs on its own origin, so session cookies do not reach it. The main API
  stays the front door: an authenticated `POST` mints a short-lived HMAC zone ticket
  (same `SESSION_SECRET`, distinct scope string, same shape as party room tokens), and
  the shell presents it over the socket. The world service verifies tickets and never
  sees a cookie.

Costs of B, honestly: a second service to monitor, a second image to build (this is
where the `isolated-vm` compile lives — contained, with the quickjs-wasm fallback one
dependency swap away), and one more URL in the deploy script. All one-time.

### C — An always-on VM (GCE)

An `e2-small` in europe-west1 is ≈ $13–15/month and never cold. Rejected: it is the
only option that costs money at zero traffic, and it re-introduces a class of work the
platform has none of today — OS patching, restart supervision, image drift, SSH keys.
The moment sustained load makes Cloud Run's active-hour pricing look expensive
(roughly >150 always-occupied hours/month), this becomes the cheap option and the
protocol does not care — but that moment is a success problem, and moving is a
deploy-script change.

### D — Stateful edge (Cloudflare Durable Objects / PartyKit)

Shape-wise the best fit on the market — a Durable Object _is_ "an actor with storage
and hibernation". Rejected on posture, not on fit: new vendor, new credentials, new
ToS surface for untrusted-code execution, and the isolate decision already made
(`isolated-vm` inside our own cage) does not port. The multiplayer plan rejected
third-party realtime for the same reasons and nothing has changed.

### Session affinity, addressed because §8 names it

`--session-affinity` pins a _client_ to an instance, not a _room_ — two players of one
zone still land on two instances. It was the wrong tool for party rooms (§4.6) and it
is the wrong tool here, at any instance count. What replaces it when scale-out comes is
the zone directory: the shell asks the API where zone Z lives and dials that URL. Not
needed at max-instances 1; designed for now, built later.

---

## 3. Recommendation

**A separate `gamedev-world` Cloud Run service** (option B): same repo, own image with
`isolated-vm` built in, request-based billing, `--min-instances 0 --max-instances 1`,
`--timeout 3600`, WebSockets, europe-west1. The main API mints HMAC zone tickets;
the world service verifies them and owns nothing else about identity.

|                      | zero traffic           | low traffic (beta)                          | failure mode                |
| -------------------- | ---------------------- | ------------------------------------------- | --------------------------- |
| Compute              | $0 (no instances)      | ~$0.09/active-hour, first ~50 h/mo free     | capped by max-instances 1   |
| Firestore            | storage only (pennies) | 1 snapshot write / zone / 30 s while active | bounded by snapshot cadence |
| The bill scales with | —                      | concurrent play                             | never with number of worlds |

---

## 4. How hibernation bounds the cost (the mechanism, concretely)

The lifecycle the host implements; every arrow that points at "nothing running" is
where the money stops:

1. **Occupied → ticking.** Zone lives in memory, ticks at its manifest `tickHz`,
   snapshots to Firestore every 30 s (a full snapshot is ≤ 192 KiB by contract, one
   document write; the event log since the last snapshot rides along for replay).
2. **Last player leaves → park, then hibernate.** The final snapshot is written the
   moment the last seat goes, and the sim stops ticking — no timers, no keep-alives,
   nothing that would hold CPU on an empty world. The loaded isolate is then _held_
   for `PARK_GRACE_MS` (one minute) and dropped afterwards. The grace exists because
   the common way to leave a zone is not to leave it: a phone locking its screen, a
   tab going to the background, a deploy redial. Each closes the socket and reopens it
   seconds later, and each used to cost a Firestore read, a games-repo fetch and a cold
   isolate. A return inside the grace is `wake(elapsed)` on the world already in
   memory — the same catch-up a cold wake performs, minus the reload. Nothing ticks and
   nothing writes while parked, and hibernating a parked zone writes nothing either
   (the park-time snapshot is still the world), so the cost model is unchanged: an
   empty zone is one Firestore document, plus for one minute an idle isolate. When the
   last zone on the instance parks, the last socket is gone, the last request ends,
   and Cloud Run drains the instance — the parked copy simply dies with it, which is
   fine, because the snapshot was written first. A full host evicts its longest-parked
   zone before refusing a new one: a held world never outranks a player who wants to
   open one. This is the step that makes min-instances 0 honest.
3. **Player arrives at a sleeping zone → wake.** Load snapshot, rebuild the realm,
   fast-forward the rng by the recorded draw count, call `wake(state, elapsedMs, rng)`
   once with real elapsed wall time. The game's own code decides what sleep meant —
   capped catch-up is the game's business (Ember Watch caps at 600 ticks), bounded
   wake cost is enforced by the platform (`MAX_WAKE_MS`).
4. **Instance dies mid-game → unscheduled hibernate.** Loss is bounded by the snapshot
   cadence plus the event log; clients reconnect (the party-mode reconnect muscle),
   the zone wakes on the next instance, and the worst outcome is the last few seconds
   replayed or lost. SIGTERM gets the graceful version of the same move.

Runtime metering closes the loop on cost: `MAX_TICK_MS` and the state-size ceiling are
enforced per tick in production (not only in CI), a zone that blows its budget is
hibernated with prejudice rather than allowed to eat the instance, and the instance
refuses new zones past its measured capacity instead of degrading every zone it holds.

---

## 5. What must be decided now vs. later

**Now (this document):** option B; ticket-based auth through the main API; snapshot
cadence as the loss bound; runtime budget enforcement as the cost bound.

**Later, with named triggers:**

- _Zone directory + max-instances > 1_ — when one vCPU's worth of concurrent zones is
  routinely exceeded (metric: sustained tick-budget saturation, not a date).
- _Move to a VM or committed-use pricing_ — when active hours make Cloud Run the
  expensive option (>~150 always-occupied hours/month, ~$13/mo crossover).
- _quickjs-wasm fallback_ — if the `isolated-vm` build breaks and stays broken; costs
  ~20× CPU, still ~2.7% of a core per zone at 10 Hz, swap is contained to one module.

---

## 6. What shipped against this

| Claim in this document                                    | Where it lives now                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Separate service, own image, own cadence                  | `apps/world/`, `apps/world/Dockerfile`, `infra/cloudbuild-world.yaml` |
| min-instances 0, max-instances 1, 60-min timeout          | `infra/deploy-world.sh`                                               |
| HMAC tickets from the main API; host never sees a cookie  | `packages/zone-core/src/ticket.ts`, `apps/api/src/realtime/zones.ts`  |
| `isolated-vm` in production, `node:vm` never              | `packages/zone-core/src/cage.ts`, `assertProductionCage`              |
| Park on empty, hibernate after the grace; instance drains | `Zone.park`, `Zone.hibernate`, `PARK_GRACE_MS`, `ZoneHost.pump`       |
| Wake via `wake()` with rng draw alignment                 | `Zone.wakeUp`, `SimInstance.restore`                                  |
| Snapshot every 30 s; that is the loss bound               | `SNAPSHOT_EVERY_MS`, `Zone.persist`                                   |
| Runtime metering, not only CI                             | `Zone.recordTickCost`, `Zone.measure`                                 |
| SIGTERM is a scheduled hibernate                          | `ZoneHost.shutdown`, `apps/world/src/platform/server.ts`              |

Three things about the build are worth knowing before changing any of it.

**The metering clock is not the zone's clock.** `now` schedules ticks and stamps
snapshots, and a test drives it in fixed jumps; `monotonicMs` is what measures how long a
tick actually took. They were one parameter at first, which made the budget check measure
the schedule instead of the work — it passed for a sim that spent 40 ms a tick.

**Storability is decided inside the realm, before `JSON.stringify`.** Stringify does not
refuse the values it cannot carry, it rewrites them: `Infinity` and `NaN` become `null`,
a `Map` becomes `{}`, `-0` becomes `0`. By the time the host has a string to inspect the
evidence is gone and the state looks perfectly storable — and keeps looking that way
until the zone sleeps and wakes as a different world.

**One timer drives every zone.** A per-zone interval would make an overloaded instance
quietly late for everyone; one sweep makes "how many zones can this box afford?" a
question with an answer, and `MAX_ZONES_PER_INSTANCE` is what it answers today.

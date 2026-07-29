# P3 zone protocol

Status: **shipped, both ends, 2026-07-28.** The wire and bridge protocol for
authoritative real-time zones ([persistent-world-plan.md](./persistent-world-plan.md)
§5 P3). The shell speaks it from `apps/web/src/zone/`; the host answers it from
`apps/world/` (see [p3-zone-host-infra.md](./p3-zone-host-infra.md)).

This is the reference both ends are implemented against. The authority is the code —
`apps/web/src/zone/protocol.ts` for the client parsers, `packages/zone-core/src/schema.ts`
for the declaration and the server-side input check — and this document explains the
parts of it that are decisions rather than mechanics.

---

## 1. Three hops, and who is trusted on each

```
game iframe  ──postMessage──▶  shell  ──WSS──▶  zone host
(untrusted)                 (trusted)         (authoritative)
                                │
                                └──HTTPS──▶ main API  (admission only)
```

The game never touches the network — `sandbox="allow-scripts"`, no
`allow-same-origin`, a CSP with no `connect-src`. That invariant is unchanged by P3 and
is why the zone client lives in `apps/web` rather than in the games repo. The shell owns
the socket; the game reaches it only through typed, size-capped bridge messages.

The zone host is a **separate service on its own origin**, so the session cookie does not
reach it. Admission is therefore a two-step: the main API authenticates the player and
mints a short-lived HMAC ticket, and the shell presents that ticket to the host.

## 2. Admission — `POST /api/games/:slug/zone/ticket`

Answers with `{ zone, hostUrl, ticket, expiresAt, tickHz, maxPlayers, inputs, durable }`,
or 404 when the game declares no zone, is not published, or no host is configured on this
deployment. All of those are "there is nothing here" from the game's side.

Two things worth knowing:

- **`hostUrl` is returned, not derived.** At one instance it is just the service URL, but
  it is also the seam the zone directory (§8 of the plan) slots into when one instance
  stops being enough: the API answers "zone Z lives at U" and the shell dials U, with no
  protocol change.
- **The ticket carries a pseudonym, never a uid.** `zonePlayerTag` is an HMAC over
  `(zone, uid)`, so it is stable for one person in one zone — a reconnect returns to the
  same seat — and uncorrelatable across zones. The host runs untrusted game code;
  handing it durable identity would make the sim isolate a privacy boundary as well as a
  safety one, and one cage should not have two jobs. Guests get a per-ticket random tag,
  which is the same statement about somebody with no durable identity, and `durable`
  tells the game which it is (plan §9: visiting is anonymous, persisting is not).

## 3. The socket — `wss://<host>/zone/ws`

**Up** (client → host). Every frame carries `v: 1`.

| frame    | fields           | notes                                     |
| -------- | ---------------- | ----------------------------------------- |
| `hello`  | `zone`, `ticket` | first frame; ticket never in the URL      |
| `input`  | `k`, `d?`        | one declared event kind; **no slot**      |
| `resync` | —                | "I have lost the thread, send a snapshot" |
| `bye`    | —                | leaving; lets the host hibernate promptly |

**Down** (host → client).

| frame     | fields                                         | notes                                                 |
| --------- | ---------------------------------------------- | ----------------------------------------------------- |
| `welcome` | `slot`, `zone`, `slug`, `tickHz`, `maxPlayers` |                                                       |
| `snap`    | `tick`, `seed`, `draws`, `state`               | full state as an opaque JSON **string**               |
| `delta`   | `tick`, `ev[]`, `h?`                           | the events the host applied; `h` is a checkpoint hash |
| `roster`  | `slots[]`                                      |                                                       |
| `closed`  | `reason`                                       |                                                       |

### Why a delta is events, not a state diff

The obvious design diffs the state. This does not, for a reason that only holds because
of the sim contract: **every client runs the same deterministic `sim.ts` the host
arbitrates with**, so the events the host applied to a tick are sufficient to reproduce
that tick exactly. A delta is therefore the authoritative event list — usually empty,
occasionally a handful of tiny objects — rather than a diff, which would be larger, would
need a diff format the contract does not define, and would let the shell grow opinions
about the shape of game state.

A snapshot is the fallback and the entry point: sent on join, and again on `resync`.
Between them the host attaches a state hash to a delta periodically, so a client that has
drifted finds out within a second or two instead of playing an increasingly private
version of the world.

### Why `draws` is on every snapshot

It is how many numbers the zone's generator has produced up to that tick — the one part
of the generator's position a snapshot cannot record, because the state is the sim's and
the stream is the platform's. Without it a client cannot put its predictor on the
sequence the host is on. This is the same move the CI harness makes in
`resumeFromSnapshotWithAlignment`, and it is why `init` takes the generator as well as
the seed (see the spike report §1).

### Why the value field is `d` and not `v`

Every frame already carries `v` as the protocol version. An input whose value is a string
would overwrite it and be dropped as a version mismatch — intermittently, and looking
exactly like a desync. Party mode learned this on a key-release of `0` and named the field
`d`; a zone would have learned it on the first enum input.

Inside a `delta` the nested events keep `v`, because they have no version field of their
own and that is the shape `sim-contract.ts` defines — so the sim receives exactly what it
expects with nothing rewritten in between.

## 4. What a client is never allowed to say

Two rules, enforced in the shell _and_ re-enforced on the host, because a modified client
does not run the shell's copy:

1. **A client cannot name its own slot.** The host tags every event with the slot it
   arrived on. A client that could name one could act as another player.
2. **A client cannot send `join` or `leave`** (`RESERVED_EVENT_KINDS`). Arrivals and
   departures are facts the host knows and tells the sim, not claims a client may make.
   A client that could send `join` could conjure a player; one that could send `leave`
   could evict a real one.

Everything else about validity — is this kind declared, is this enum value in the set, is
this int in range — is the **host's** job, where a modified client cannot reach it.
`validateZoneInput` refuses rather than clamps: a client that sent 999 for a 0–8 lane
meant something, and quietly turning that into 8 would make the sim act on an intent
nobody had.

## 5. The bridge (shell ↔ game)

Namespace `gdp`, version 1, same as every other bridge.

Up: `zone:hello`, `zone:send {k, d?}`, `zone:resync`.
Down: `zone:state` (the availability handshake), `zone:snap`, `zone:delta`,
`zone:roster`, `zone:closed`, `zone:link` (transport status).

The shell is a **relay, not a client**: it validates and forwards, and never interprets.
Snapshot state passes through as an opaque string — the P1 save lesson, applied again, so
the thing measured is the thing forwarded and the shell never has to have an opinion about
a shape that belongs to the game. Whether a prediction has drifted is decided by the sim
on the other side of the bridge, which is the same `sim.ts` the host is running.

The bridge is live for every published game, as saves and worlds are. Nothing happens
until a game says `zone:hello`, and only a game that ships a sim ever does — the capability
is derived from what the game does rather than from a declaration that could drift.

## 6. Reconnecting means rejoining, not resuming

A party guest reconnecting takes a free slot. A zone player reconnecting rejoins **a world
that kept running without them**, possibly one that hibernated and was woken by their
return. So a reconnect always re-establishes from a snapshot rather than resuming a
stream, and the client tracks nothing about state itself.

`zone_full` is deliberately _not_ a final reason: a zone is a place rather than a session,
so a full one is a queue to wait in, not a door that closed. Nor is `hibernating` — the
host is snapshotting and will accept the next dial.

Inputs are dropped rather than queued while the socket is down. An input is an intent
about a moment; a zone that replayed a second of buffered intents on reconnect would act
out a plan the player abandoned while the screen was frozen.

# Roadmap

Status legend: ✅ done · 🚧 in progress · 📋 planned/not started · 🗃️ retired

> Reality-synced 2026-09-02. The original Phase 1–5 plan is **complete and in
> production**: https://www.gamedev.pl has been serving the new app in closed beta
> since 2026-07-23, on Cloud Run (europe-west1) with a native domain mapping.
> Phases below are kept for the record with what actually shipped, what shipped
> _differently_, and what is genuinely still open. Several large workstreams
> happened off this roadmap entirely — they are listed under
> [Shipped off-roadmap](#shipped-off-roadmap).

## Phase 0 — Local player proof ✅

The local `prompt → mock template → sandboxed iframe` slice is complete:

- npm workspaces with React/Vite, Fastify, and strict TypeScript.
- `GameProject` plus a deterministic mock and three playable templates.
- A self-contained bundle assembler and sandboxed iframe player.
- Request validation, bundle size limits, credential-pattern scanning, localization,
  tests, linting, and CI.

The mock preview and the local `prompt → mock template` generator described above are gone —
`apps/api/src/generator.ts` is not tracked in git. Real creation (spec → agent round → build
channel → gate → publish, see [`architecture.md`](./architecture.md)) superseded it. That closes
Phase 2's open question, just not the way this paragraph originally described.

## Retired direction — self-hosted generation 🗃️

The container runner, auth proxy, job tokens, in-process orchestrator, `/api/jobs`
endpoints, and container generator were removed. The app will not run coding agents
on behalf of creators. Historical design and security notes remain in the repository
for context, but this work is not scheduled and must not be treated as an incomplete
phase.

## Phase 1 — Dedicated games repository ✅

**Goal:** establish the source of truth and publishing contract for agent-maintained games.

Done: the repository exists with agent instructions, issue templates, seeded games,
static validation, bundle assembly (`tools/lib/assemble.ts`), catalog generation
(`tools/catalog.mjs`), spec parsing (`tools/lib/spec.mjs`), PR validation, and
main-branch publishing. Human review is the merge gate, and remains so.

**Shipped differently — the cookieless games origin decision was overtaken.** The
plan was to pick GitHub Pages or a bucket/CDN. Instead, published games are fetched
from the games repo by the API and served through the app
([github-client.ts](../apps/api/src/catalog/github-client.ts) builds the catalog straight
from `games/` directories rather than depending on a public `catalog.json`), then run
in the sandboxed iframe via `srcDoc`. Isolation comes from
`sandbox="allow-scripts allow-pointer-lock"` with no `allow-same-origin` plus an opaque origin — not
from a separate hostname. The upside is decisive: **the games repo can be private**,
and unmerged PR previews are playable. The invariant to keep in mind is that the
assembler and the games repo's own `tools/lib/assemble.ts` must stay in lockstep;
`github-client.ts` says so at the module boundary.

## Phase 2 — Catalog and player ✅

**Goal:** turn this app from a mock generator demo into a useful game catalog.

Done: the catalog contract, browse/select, published bundles in the sandboxed iframe,
loading/unavailable/failure states, and an automated regression test for the sandbox
invariant ([GameFrame.sandbox.test.ts](../apps/web/src/GameFrame.sandbox.test.ts)).

Grew well past the original scope: a full-screen theater ([GameTheater.tsx](../apps/web/src/GameTheater.tsx)),
a host-injected player bridge that moves the game's title/description/sound chrome
into the app header ([gamePlayer.ts](../apps/web/src/gamePlayer.ts)), web-side game
i18n by rewriting `<html lang>`, keyboard focus handed to the game on load, direct
play hash routes, shareable slug permalinks, and ETag-revalidated gallery media.

## Phase 3 — Spec submission and status ✅

**Goal:** let a creator commission a game without implying instant generation.

Done: structured spec input, Google sign-in as the attribution mechanism, moderation
and rate limits and per-user daily quotas, a round dispatched to an agent backend with
credentials that never reach the browser, and the full lifecycle surfaced (queued → in review →
building → gate → published / needs changes). (Not issue filing — see
[`architecture.md`](./architecture.md) for the actual build-channel delivery mechanism.)

Also shipped here, beyond the original list: a clarifying-questions QA pass before
spec freeze (now a hard precondition), spec refinement, a my-games rail, revision
history, a localized build log, stop-a-build and retry-an-idea controls, today's
allowance display, and creator steering before a draft exists.

## Phase 4 — Remix through spec changes 🚧

**Goal:** let a player propose a change while preserving review and ownership.

The **machinery is built and running, but only for the creator's own games.** For a game
still building, `POST /api/submissions/:token/feedback` moderates and sanitizes the text and
queues it into the agent inbox as a message explicitly marked as data-not-instructions. For a
published game, `POST /api/submissions/:token/improve` (`creation/improve-routes.ts`) does the
published-game equivalent — `feedback` 409s once `publishedAt` is set — moderating the text and
opening a new round via `startImprovementRound`. Either way this is exactly the "capture a
change request → agent round → preview in the same sandbox → never auto-merge" loop the phase
describes (not a scoped issue or a PR).

Still open, and this is the actual remaining work of the phase:

- A **player**-facing (not owner-facing) change request against a published game's
  `SPEC.md`. Today the token gates this to the submission's owner; "remix" appears in
  the marketing copy but there is no player entry point.
- Ownership and attribution rules for a remix that forks someone else's spec.

See [`remix-to-pr.md`](./remix-to-pr.md).

## Phase 5 — Production delivery ✅ (with a known-gaps list)

**Goal:** deploy only the catalog, player, submission API, and static games pipeline
actually required by the pivot.

Done: Cloud Run in europe-west1 with a native domain mapping and an apex 301,
app origin separate from game execution (opaque-origin sandbox, see Phase 1),
and OIDC/Workload-Identity-Federation deployment credentials — `deploy.yml`
requests `id-token: write` and authenticates via `workload_identity_provider`, so no
long-lived service-account key exists.

Genuinely still open, in rough priority order:

- ✅ **The multiplayer instance-count mismatch is fixed** (2026-07-25). Both deploy
  paths set `--max-instances 1`, which [mp.ts](../apps/api/src/realtime/mp.ts) requires while
  multiplayer is enabled: rooms are per-instance in-memory state, so a guest
  load-balanced onto a second container sees a valid room code as "no such room".
  Before the fix it worked only because closed-beta traffic rarely warms a second
  instance — the sort of defect that surfaces on a traffic bump and gets blamed on
  the guest's wifi.
- 🟡 **The cap is the scaling ceiling for the whole API, and the way out is now built
  but not switched on.** Catalog, submissions, telemetry, and status polling all share
  the one container multiplayer needs. The relay has its own service
  ([deploy-relay.sh](../infra/deploy-relay.sh)) and both deploy paths derive the ceiling
  from `MP_RELAY_URL`, so lifting the cap and moving the rooms are one action rather than
  two — see [multiplayer-plan.md](./multiplayer-plan.md) §4.6 and
  [deployment.md](./deployment.md#splitting-the-party-relay-out-lifting-the-ceiling).
  What remains is owner-run: create the service, set the variable. Note that Cloud Run's
  `--session-affinity` was never a fix — it is per-client and cannot map a guest onto
  the host's instance.
- 📋 Takedown operations, backups, and published-catalog rollback.
- 📋 Observability beyond Cloud Run's defaults — no dashboards or alerting on the
  paths that now matter (submission failures, relay stalls, sweep health). Relay
  stalls are at least _detected_ now (the notify sweep logs them at `error`); what
  is missing is anything that notices the log.
- 📋 Protected deployment environments; no `environment:` gate on `deploy.yml`.
- 📋 Action pinning is incomplete: the Google auth/gcloud actions in `deploy.yml` are
  SHA-pinned, but first-party `actions/checkout` / `actions/setup-node` remain on
  major tags across all workflows.
- 📋 Infrastructure as code. Delivery is shell scripts plus `cloudbuild.yaml`; the
  resources are now decided, so the original "IaC only after resources exist"
  precondition is satisfied.

## Shipped off-roadmap

Substantial work that never had a roadmap phase. Each has its own plan document,
which is the authority on its detail:

| Workstream                | Status                                                                                           | Plan                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Closed beta launch        | ✅ live 2026-07-23 on www.gamedev.pl                                                             | [closed-beta-launch-plan.md](./closed-beta-launch-plan.md)                                                                  |
| Auth, usage & quotas      | ✅ Google sign-in, per-user daily counters, waitlist/allowlist                                   | [auth-and-usage-plan.md](./auth-and-usage-plan.md)                                                                          |
| Content safety            | ✅ moderation on submission via the genai seam; beta allowlist as the interim outer safeguard    | [content-safety-plan.md](./content-safety-plan.md)                                                                          |
| Creator QA pass           | ✅ clarifying questions before spec freeze, now a hard precondition                              | [creator-qa-plan.md](./creator-qa-plan.md)                                                                                  |
| Notifications             | ✅ in-app bell, email + unsubscribe, Web Push (desktop/Android), Cloud Scheduler sweep           | [notifications-plan.md](./notifications-plan.md)                                                                            |
| Live agent build channel  | ✅ agent posts progress/screenshots and gets queued creator requests back                        | [agent-live-channel-plan.md](./agent-live-channel-plan.md)                                                                  |
| Creator experience review | ✅ backlog from a real three-hour session, closed out                                            | [creator-experience-review.md](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/creator-experience-review.md) |
| Multiplayer party mode    | 🚧 relay + party module + seed games built; the single-instance cap is its price (see Phase 5)   | [multiplayer-plan.md](./multiplayer-plan.md)                                                                                |
| Mobile                    | 🚧 mobile web ✅ + PWA ✅ (device-verified, iOS push works); store apps need Apple/Play accounts | [mobile-app-plan.md](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/mobile-app-plan.md)                     |

## Phase 6 — Improvement loop 📋

**Goal:** the loop currently ends at "published". Nothing is learned after a game
ships — not whether anyone played it, not where they quit, not whether a revision
helped. This is the first phase whose subject is the platform improving itself.

Player signals (written feedback, thumbs, session telemetry, funnel) → a per-game
scorecard → agent-assisted fixes and suggestions, with merge staying a human gate.
See [`improvement-loop-plan.md`](./improvement-loop-plan.md); IL-1 is deliberately
scoped to need no games-repo change at all.

## Next decision

The bottleneck moved. It is no longer building the pipeline — the pipeline works and
creators are using it. It is that **the platform is blind after publish**, so every
agent run is spent on creation and none on improving games that already have players.
Phase 6's capture plane is the cheapest thing that changes that, and it produces
value (creators see numbers, defects become visible) before any agent is involved.

Both of the cheap silent-failure items this section used to list alongside it are
now closed. The multiplayer instance-count mismatch was fixed on 2026-07-25 (Phase
5), and the Copilot relay path that every agent hand-off depends on now has a
detector: the notify sweep logs at `error` when a creator's change request has gone
uncollected for an hour, which is what a broken relay looks like from this side.

What is left of the second one is delivery, not detection — that is a line in the
logs, and nothing yet reads the logs. Routing it somewhere a human sees remains part
of the observability gap in Phase 5.

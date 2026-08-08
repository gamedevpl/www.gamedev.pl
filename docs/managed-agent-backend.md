# Managed agent backend — running the builder ourselves, on a swappable vendor

> Status: 🚧 **Seam landed, delivery sink pending.** The provider abstraction, the
> `AgentBackend` over it, one vendor adapter and the environment selection are in. The
> delivery sink is injected by the caller and is the next piece to wire — see
> [What is not wired yet](#what-is-not-wired-yet).

## Why this exists

The platform builder has always been one vendor's integration: an agent task on GitHub,
a branch, a premium request we cannot see inside. A _managed_ backend is the other shape —
we start a coding agent on a hosted agent platform, hand it a workspace, and read the
files back out. It is the option that makes per-build attribution, hard caps and enforced
cancellation possible, because we own the session rather than assigning it.

The risk in building it is picking a vendor and discovering the vendor is the design. So
the vendor is behind a seam narrow enough to be re-implemented in an afternoon.

## The seam

[`managed-agent.ts`](../apps/api/src/managed-agent.ts) is four capabilities and nothing
else:

| Capability | Method          | Why it is the whole surface                           |
| ---------- | --------------- | ----------------------------------------------------- |
| Start      | `startSession`  | A prompt, a model, a workspace, an output directory   |
| Observe    | `getSession`    | One normalized state plus token usage                 |
| Harvest    | `listOutputs`   | The delivery, pulled — never pushed through the model |
| Stop       | `cancelSession` | With an honest `enforced` answer                      |

`deleteSession` is optional, because releasing sandbox state is a courtesy some vendors
do for you.

**What deliberately does not appear:** HTTP shapes, beta headers, SDK types, polling
intervals, credential handling, per-vendor state words, file-layout assumptions. Anything
a second vendor would spell differently belongs in its adapter.

### The three things that make it swappable

1. **State vocabulary is ours, not theirs.** `normalizeManagedState` maps every vendor
   spelling we have seen — `running`, `status_idle`, `succeeded`, `expired`, `canceled` —
   onto the `AgentTaskState` the job machine already understands. An unknown word reads as
   `in_progress`, never `failed`: a vendor adding a state is not a reason to abandon a live
   build.
2. **Usage is tokens.** Credits are one vendor's billing unit and cannot be converted to
   another's at any published rate, so `sessionTokens` is its own field beside
   `sessionCredits` rather than a reinterpretation of it. A cost report stays honest
   because each backend reports the only unit it actually knows.
3. **The vendor is a variable.** `MANAGED_AGENT_VENDOR` selects a registered adapter.
   Adding one is a `registerManagedProvider` line and a file; replacing one is an
   environment change and a deploy.

## Delivery is a pull, and that moves the caps

The agent writes its game into the session's output directory and we read it back. That
deletes the delivery's token cost entirely — no staging calls, no re-emitting a tree the
sandbox already holds.

It also removes the ceiling that used to bound a delivery implicitly. A push was limited
by what could fit in a tool argument; a pull is limited by nothing, so the caps are
explicit and enforced before anything reaches the store:

- at most 60 files, 2 MB in total, 1 MB per file (`DEFAULT_MANAGED_OUTPUT_CAPS`)
- paths mapped through `toGameRelativeOutputs`, which strips `games/<slug>/` and **drops
  any other game's directory** — a sandbox that wandered cannot deliver over a neighbour
- a refused harvest is not retried: the same sandbox would produce the same bytes

Harvest happens inside `observe`, at most once per session, and only when the job has no
candidate yet. That is why `observe` now receives `issueNumber` and `slug`: a pull-delivery
backend has to know which job and game it is harvesting for, and a vendor session id does
not say. Push-delivery backends ignore the new fields.

`idle` counts as harvestable alongside the terminal states. Hosted runtimes park a
finished agent rather than completing it, and waiting for a terminal word would leave a
delivered game unread indefinitely.

## What is not wired yet

`ManagedDeliverySink` is injected, not implemented here. The channel's `submit_sources`
route already does the whole job — validate, `putCandidateSources`, set the preview or
delivered version, count the round's deliveries, trigger the gate — inline in its handler.
The honest next step is to **extract that into one function and pass it in**, so a managed
harvest and an agent upload cannot drift into two different definitions of "delivered".

Until that lands, `createManagedPlatformBackendFromEnv` refuses to build a backend without
a sink and says so in the log. A backend that ran agents whose work was silently discarded
would be worse than no backend.

## Configuration

| Variable                      | Meaning                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `MANAGED_AGENT_VENDOR`        | Registered adapter id. Absent → Copilot keeps the platform slot |
| `MANAGED_AGENT_API_KEY`       | Vendor credential. Never logged, never persisted                |
| `MANAGED_AGENT_MODEL`         | Pinned per deploy; auto-selection makes runs unattributable     |
| `MANAGED_AGENT_EFFORT`        | `low` / `medium` / `high`                                       |
| `MANAGED_AGENT_MAX_SECONDS`   | Hard ceiling on one session's wall clock                        |
| `MANAGED_AGENT_DELIVERY_MODE` | `preview` (default) or `publish`                                |
| `MANAGED_AGENT_BASE_URL`      | Override the API origin — gateways, tests                       |

Selection replaces the _platform_ backend. Builder routing, the job state machine, the
gate, Studio and self builds are untouched: a managed round is a platform round whose
agent we happen to run.

## Adding a vendor

1. Write `managed-provider-<vendor>.ts` implementing `ManagedAgentProvider`.
2. Normalize states with `normalizeManagedState`; report usage in tokens.
3. Return paths relative to the request's `outputPath`.
4. Answer `cancelSession` honestly — `enforced: false` if the stop is cooperative.
5. `registerManagedProvider('<vendor>', factory)` at the bottom of the file.
6. Import it once where adapters are registered.

The test suite for the Anthropic adapter is the shape to copy: an injected `fetchImpl`,
no network, and assertions that the credential never reaches a URL.

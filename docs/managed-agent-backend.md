# Managed agent backend — running the builder ourselves, on a swappable vendor

> Status: ✅ **MCP, Copilot, and Gemini drivers are implemented.** Anthropic and Gemini use
> the MCP lane; Copilot defaults to the existing repository harness and build channel, with
> an opt-in MCP lane for selected rounds. All three run through the managed lifecycle and
> record their native usage units. Production cutover remains gated by the MP-04 owner
> approval described in the migration brief.
>
> **Why this is not the execution model that was removed for legal reasons.** The thing
> [`games-repo.md`](./games-repo.md) abandoned was agent compute _we operate_ — containers
> of ours running untrusted prompts against credentials we hold. Here the sandbox is the
> vendor's, and the credential is a metered first-party API key rather than a seat on a
> subscription licensed to a human. No container of ours runs a creator's prompt, so the
> credential-exfiltration and subscription-terms findings do not apply. Whether to run a
> builder on the platform's own account at all remains a business decision, taken outside
> this doc.

## Why this exists

The platform builder has always been one vendor's integration: an agent task on GitHub,
a branch, a premium request we cannot see inside. A _managed_ backend is the other shape —
we start a coding agent on a hosted agent platform, hand it a workspace, and read the
files back out. It is the option that makes per-build attribution, hard caps and enforced
cancellation possible, because we own the session rather than assigning it.

The risk in building it is picking a vendor and discovering the vendor is the design. So
the vendor is behind a seam narrow enough to be re-implemented in an afternoon.

## GM-01 Gemini Managed Agents research findings

This is the written vendor gate for the Gemini driver. It records the five questions that
had to be answered before implementation, with links to the primary Google documentation.

| Question                                                        | Finding                                                                                                                                                                                                                                           | Evidence and implementation consequence                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can a background interaction call a remote MCP server mid-loop? | Yes. Remote `mcp_server` tools are part of the managed-agent interaction shape, and tool-call/result steps are represented in the interaction record.                                                                                             | [Managed Agents](https://ai.google.dev/gemini-api/docs/antigravity-agent) and the [Interactions API](https://ai.google.dev/api/interactions-api). Gemini declares the platform MCP endpoint as a tool and uses the MCP prompt lane.                                                                                                |
| How does a round authenticate its MCP call?                     | MCP tool headers can carry an interaction-specific `Authorization` header. A static connector-tier secret is therefore not a prerequisite for this provider.                                                                                      | [Managed Agents authentication](https://ai.google.dev/gemini-api/docs/antigravity-agent). The adapter matches the current round's MCP URL and places its bearer only in that interaction's tool definition.                                                                                                                        |
| Can remote egress be restricted to the MCP host?                | Yes. A remote environment accepts a network allowlist; the adapter derives it from MCP endpoint hostnames plus configured allowed hosts.                                                                                                          | [Agent environments](https://ai.google.dev/gemini-api/docs/agent-environment). Named environments are refreshed with the allowlist; inline seed files are rejected for named environments rather than silently ignored.                                                                                                            |
| Is there a native token ceiling and usage ledger?               | Yes. `agent_config.max_total_tokens` is the native interaction ceiling, and usage exposes input, output, thought, cached, tool-use, and total token fields.                                                                                       | [Custom agents](https://ai.google.dev/gemini-api/docs/custom-agents) and the [Interactions API](https://ai.google.dev/api/interactions-api). The shared backend represents the ceiling as `ManagedUsageBudget` with `unit: 'tokens'`, while the provider forwards the same value natively.                                         |
| What are the lifecycle, cancellation, and output boundaries?    | Background interactions expose lifecycle states including running, completed, failed, incomplete, and budget-exceeded; cancellation is a dedicated interaction endpoint. The API does not provide a session file-listing surface for this driver. | [Background execution](https://ai.google.dev/gemini-api/docs/background-execution) and the [Interactions API](https://ai.google.dev/api/interactions-api). The adapter maps incomplete/budget-exceeded to a finished state, reports `enforced` only after a non-empty cancel response, and deliberately exposes no output harvest. |

The conclusions above remove the assumed MP-05 static connector dependency for Gemini, while
preserving the platform's existing round-scoped MCP capability and the shared cancellation
and budget-stop record.

## The seam

[`managed-agent.ts`](../apps/api/src/managed-agent.ts) is four capabilities and nothing
else:

| Capability | Method                       | Why it is the whole surface                           |
| ---------- | ---------------------------- | ----------------------------------------------------- |
| Start      | `startSession`               | A prompt, a model, a workspace, an output directory   |
| Observe    | `getSession`                 | One normalized state plus native usage                |
| Harvest    | `listOutputs` / `readOutput` | The delivery, pulled — never pushed through the model |
| Stop       | `cancelSession`              | With an honest `enforced` answer                      |

Listing and reading are separate on purpose. A single `listOutputs` that returned content
would have already spent the bytes by the time any cap could look at them, so the listing
carries sizes and an opaque handle, and the backend decides what is worth fetching.

`deleteSession` is optional, because releasing sandbox state is a courtesy some vendors
do for you.

**What deliberately does not appear:** HTTP shapes, beta headers, SDK types, polling
intervals, credential handling, per-vendor state words, file-layout assumptions. Anything
a second vendor would spell differently belongs in its adapter.

### The four things that make it swappable

1. **State vocabulary is ours, not theirs.** `normalizeManagedState` maps every vendor
   spelling we have seen — `running`, `status_idle`, `succeeded`, `expired`, `canceled` —
   onto the `AgentTaskState` the job machine already understands. An unknown word reads as
   `in_progress`, never `failed`: a vendor adding a state is not a reason to abandon a live
   build.
2. **Usage keeps native units.** Token and credit observations are discriminated and carry
   their vendor/model identity. No driver converts one unit into another.
3. **The shared parts are shared, and live in neutral files.** The state vocabulary is
   `agent-state.ts`, not GitHub's client; the brief is `build-prompt.ts`, not Copilot's
   backend. Both used to sit inside the first backend that needed them, which made a second
   backend look like it depended on the first.
4. **The vendor is a variable.** `MANAGED_AGENT_VENDOR` selects a registered adapter.
   Adding one is a `registerManagedProvider` line and a file; replacing one is an
  environment change and a deploy.

## Anthropic under the seam

Anthropic rounds defer optional MCP tool definitions at the provider layer so the context starts
with the round-start, source-read and delivery path. The server's shared MCP behavioural contract
is carried once in `initialize.instructions`; it must not be repeated in every tool description.

## Copilot under the seam

Copilot now implements `ManagedAgentProvider` while keeping its harness-specific answers:

| Seam capability          | Copilot's answer                                           |
| ------------------------ | ---------------------------------------------------------- |
| `startSession` workspace | A **branch**, staged with git writes — not a list of files |
| `getSession` usage       | **Credits**, never tokens                                  |
| `listOutputs`            | Nothing to list. Delivery is a push over the build channel |
| `cancelSession`          | Fits — cooperative, `enforced: false`                      |

The driver declares the harness prompt lane by default. A round may override that lane
through `BuildBrief.promptLane`; vendor names do not choose prompt behavior.

### Copilot MCP lane

The Copilot MCP lane replaces the harness lane for the selected round. It is intended for
fast previews: the prompt uses the same `buildPrompt` fast contract as Anthropic, and the
round key travels in `start({ slug, key })`. The static Copilot MCP connector authenticates
the connection only; the MCP server requires the live round key before it resolves any
round-scoped tool.

The two lanes are never combined in one round. Publish seals stay on the harness lane
until a caller explicitly selects MCP for a different round. The connector-only replay
test enumerates every mutating tool advertised by the MCP server and requires refusal.

GitHub configures this connector outside the repository, under the repository's Copilot
MCP settings. The remote-server header must reference an Agents secret named
`COPILOT_MCP_CONNECTOR_SECRET`, for example:

```json
{
  "mcpServers": {
    "gamedevpl": {
      "url": "https://www.gamedev.pl/api/mcp",
      "headers": {
        "Authorization": "Bearer $COPILOT_MCP_CONNECTOR_SECRET"
      }
    }
  }
}
```

The Cloud Run deployment maps the corresponding runtime value into the same environment
name. GitHub's MCP secret-prefix rule applies to the Agents-side secret; the lower-level
Secret Manager resource name is only a deployment detail. The checked-in root `mcp.json`
is the Cursor manifest and does not configure Copilot.

Copilot's firewall does not apply to MCP servers; it only covers processes started through
the agent's Bash tool. The connector bearer is therefore not an isolation boundary. The
security property is the round-key exchange and the refusal of every mutating tool before
that exchange, which the connector-only replay test keeps load-bearing.

## Gemini under the seam

Gemini uses the MCP lane and starts a background interaction with the documented
`antigravity` agent configuration. Each MCP endpoint is declared as an `mcp_server` tool;
the current round's bearer is attached to that tool's `Authorization` header, so no static
connector secret is copied into the environment or persisted in the session. The remote
environment carries the allowlist derived from the endpoint hostnames and configured
additional hosts.

An unnamed remote environment may receive the round's seed files as inline sources. A named
environment cannot accept those files through this path, so the adapter rejects that mixed
configuration before dispatch. Gemini has no file-output listing API in this seam; delivery
is therefore by MCP `submit_sources`, and `listOutputs` remains empty.

The backend budget is the shared unit-tagged shape:

```ts
{ unit: 'tokens', max: 50_000 }
```

The provider forwards that same value as Gemini's native `max_total_tokens`. If measured usage
passes the ceiling, the backend records a `ManagedBudgetStop` and reports the round as
`cancelled` with `stopReason: 'budget_reached'`; a wall-clock expiry remains `timed_out`.

## Two delivery shapes, and the one guard that covers both

A managed round can deliver the way every other round does, or by being read out:

- **The agent submits (preferred).** Give the session our MCP endpoint and it runs the same
  session loop an external agent runs today, ending in `submit_sources`. Nothing about
  delivery, validation or the gate is new, because none of it is ours to reinvent.
- **We pull.** The agent writes its game into the session's output directory and we read it
  back. This costs no tokens at all — no staging calls, no re-emitting a tree the sandbox
  already holds — and it is the only route for an agent that finished without submitting.

`createManagedBackend` refuses a configuration with neither an MCP endpoint nor a delivery
sink, because that combination can only run agents whose work is discarded.

**The prompt has to agree with the backend.** `buildPrompt` takes a `DeliveryContract`, so
a pulled round is told to write into the output directory and a channel round is told to
run `npm run submit`. Getting this wrong is not a cosmetic mismatch: an agent in a sandbox
with no route to our API would spend the whole round discovering that the upload it was
instructed to perform cannot work.

What the pull shape gives up is worth stating, because it is the reason the MCP shape goes
first. There is no progress channel, so the creator watches a blank status page for the
length of the build; no inbox, so mid-round steering has nowhere to land; and no gate
verdict the agent can still act on, since the gate runs after the session has ended.
Revisions are weaker too: a channel round runs `npm run restore` to fetch the exact version
the creator played, while a pulled round can only revise what was placed in its workspace.

A pull has no ceiling of its own. A push was bounded by what fits in a tool argument; a
pull is bounded by nothing, so the caps are explicit and enforced **before** the bytes are
fetched, using the sizes in the listing, and again on arrival for vendors that omit them:

- at most 60 files, 2 MB in total, 1 MB per file (`DEFAULT_MANAGED_OUTPUT_CAPS`)
- `selectManagedOutputs` rejects traversal, absolute and Windows paths outright, and then
  takes **only `games/<slug>/`** — the one directory the brief names. Everything else is
  the sandbox's own business, and what was ignored is logged so a round that delivered
  nothing can say why
- a refused harvest is not retried: the same sandbox would produce the same bytes

The harvest then applies `forbiddenDeliveryPathReason` — the same rule `submit_sources`
enforces, so a pull cannot store what an upload would refuse: no `media/` (our gate
produces those bytes), no dotfiles, no config or build files.

**It drops those files instead of refusing the delivery, and that is not a weakened
check.** An upload can reject the request and let the agent fix the path and try again; a
pull happens after the session is gone, so failing the round over a stray screenshot would
lose a game the gate would have accepted. The invariant — non-source files never reach the
store — holds either way, and what was dropped is logged. The brief also tells a pulled
round that media and dotfiles are not delivered, so the drop is the backstop rather than
the first line of defence.

Both of those rules exist because the probe below was run: the harvest first delivered a
`scratch/notes.md` into the game's source tree, then a `media/cover.png` that the real sink
would have refused. Neither was visible to any unit test, because the fake providers only
ever returned tidy paths.

Harvest happens inside `observe`, at most once per session, and only when the job has no
candidate yet. That is why `observe` receives `issueNumber` and `slug`: a pull-delivery
backend has to know which job and game it is harvesting for, and a vendor session id does
not say. Push-delivery backends ignore those fields.

`idle` counts as harvestable alongside the terminal states. Hosted runtimes park a
finished agent rather than completing it, and waiting for a terminal word would leave a
delivered game unread indefinitely.

### A failed pull must not spend the round

`completed` with no candidate is how the job machine recognises an agent that finished
without delivering, and it fails the job. So when it is the _pull_ that failed — the files
API is down, the sink throws, another instance is mid-delivery — the observation reports
`in_progress` instead of the real state. The work exists; reporting the truth about the
session would fail the job over our own transient error, and the next poll would have
nothing left to retry.

Two pollers can also reach the same finished session at once. The process-local guard does
not survive two instances, so `ManagedDeliveryLock` is the durable one: whoever acquires it
delivers, the loser reports `in_progress` and sees the candidate on a later poll, and a
failed attempt releases the lock so the retry is not locked out. Without a lock configured
the guards are the job's own candidate flag plus a sink that must be idempotent per
`sessionRef` — which the type says out loud.

### An idle session is not necessarily a stalled one

The backend nudges a session that has gone idle without delivering, because a model that
stops mid-round otherwise burns the whole wall clock doing nothing. The trap is that the
provider cannot see the build channel at all. In the MCP shape the agent submits and calls
`end` through the channel, so by the time the vendor reports `idle` the round may already be
finished — and a preview submit sets `previewVersion`, not `deliveredVersion`, so the job's
own `hasCandidate` flag is still false. A nudge at that moment opens a second round on a job
that is already gating, and the agent has to be interrupted by hand.

So the guard reads the round, not just the session, through an injected `readSignals`. That
is the same seam the self backend takes — a reader handed in by the reconciler rather than a
store dependency inside the backend — but not the same payload: `ManagedRoundSignals` also
carries `previewVersion` and `agentEndedAt`, neither of which the self backend consults. Two
conditions independently suppress the nudge: a delivery of either lane exists, or the agent
called `end`. The second one is the important one. An agent that ended has made a decision,
and re-entering it is the damage; a round with no delivery at all still must not be restarted
behind the agent's back.

The read is taken only when a nudge is otherwise about to fire. Every cheap condition — idle,
no candidate, nudging enabled, not budget-stopped, not already nudged — is evaluated first,
so a healthy polling loop does not pay a store round trip per observation.

The message matters too. It used to assert "You have not delivered a candidate", which was
simply false in the case above. It now says what the host can actually see — that no
delivery is recorded — so a nudge that does fire cannot mislead the agent about its own
round.

## What is not wired yet

The **MCP shape is wired and proven** — production platform rounds use it when a valid
managed configuration selects the environment registry. What remains is the **pull shape**:
`ManagedDeliverySink` is still injected, not shared with the channel.
The channel's `submit_sources` route already does the whole job — validate,
`putCandidateSources`, set the preview or delivered version, count the round's deliveries,
trigger the gate — inline in its handler. The honest cleanup is to **extract that into one
function and pass it in**, so a managed harvest and an agent upload cannot drift into two
different definitions of "delivered". Until that lands, prefer MCP; the pull path stays for
agents that finish without submitting, and for the probe's printing sink.

## How to exercise it

`registerSubmissionRoutes` builds the platform registry via
`createAgentBackendRegistryFromEnv`. A managed adapter is selected only when
`MANAGED_AGENT_VENDOR` and its required configuration are valid. Without a managed vendor,
Copilot fills the platform slot only when `AGENT_TASKS_TOKEN` is configured; without either,
platform dispatch is unavailable. An explicit `agentBackends.platform` still wins over the
environment registry.

There are four levels of test:

**1. The suites.** Fake provider, no network:

```bash
npx vitest run apps/api/src/managed-agent.test.ts apps/api/src/managed-backend.test.ts \
  apps/api/src/managed-provider-anthropic.test.ts apps/api/src/managed-provider-gemini.test.ts \
  apps/api/src/build-prompt.test.ts
```

**2. The probe.** One whole round through the real backend, real caps and real path
selection, with a stub vendor and a printing sink:

```bash
npm run managed:probe -w @gamedevpl/api                 # pull shape, stub vendor
npm run managed:probe -w @gamedevpl/api -- --mcp        # MCP shape + vault credential (stub)
npm run managed:probe -w @gamedevpl/api -- --prompt     # the brief each contract produces
npm run managed:probe -w @gamedevpl/api -- --out /tmp/harvest
```

It polls twice on purpose, because the first poll is a live session and the second is a
parked one — the difference between "no harvest yet" and "harvest now" is the thing most
worth watching.

**3. The vendor's wire format.** The first implementation was a guess. The real-key
probe then verified the current contract: `POST /v1/sessions`, the
`managed-agents-2026-04-01` beta header, initial `user.message` events, session polling,
the Files API and deletion all work against the live API. The session uses the
preconfigured Agent and Environment; Sonnet 5 belongs on the Agent resource, not in the
session body:

```bash
ANTHROPIC_API_KEY=... \
MANAGED_AGENT_ID=agent_... \
MANAGED_AGENT_ENVIRONMENT_ID=env_... \
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic
```

The probe uses `ANTHROPIC_API_KEY` for this vendor and defaults to
`claude-sonnet-5`; `MANAGED_AGENT_API_KEY` or `--model` overrides either value.
`MANAGED_AGENT_ID` and `MANAGED_AGENT_ENVIRONMENT_ID` identify the preconfigured
Anthropic resources. In production, `MANAGED_AGENT_MCP_URL` makes the adapter create a
round-scoped vault containing the build capability for that exact URL; the agent never sees the
capability and the vault is archived when the round ends. `MANAGED_AGENT_VAULT_ID` and
`MANAGED_AGENT_VAULT_IDS` remain available only for probe-only static integrations.

`--mcp` now follows that production path: it mints a managed MCP opener
(`mintManagedMcpOpener`), puts it on the brief as `mcpOpenerToken`, passes
`mcpBearerCredential` into the backend, and sets `overrideTools` so the session's tool list
is the MCP endpoint. After dispatch the probe prints `credentialRef` (the vault id) and
archives it on cancel/cleanup. The MCP URL comes from `--mcp-url` or `MANAGED_AGENT_MCP_URL`
(default `https://www.gamedev.pl/api/mcp`).

```bash
ANTHROPIC_API_KEY=... \
MANAGED_AGENT_ID=agent_... \
MANAGED_AGENT_ENVIRONMENT_ID=env_... \
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --mcp --wait \
  --wait-seconds 120 --budget-usd 1
```

That proves Anthropic accepted the per-round vault. Authenticating `mcp:start` against the
live platform MCP still needs a real Firestore job and an opener signed with the same
`SUBMISSION_TOKEN_SECRET` the API uses — export that secret into the probe environment when
you have both. Without it the probe uses a local opener secret so vault creation still works
and the transcript's `mcp:start` line will show an auth error rather than "no credential
stored for this server URL".

It creates an initial event, polls twice, interrupts and deletes the session. The bare
(non-`--mcp`) probe verifies session lifecycle and costs a real run; it does not wait for a
game to finish or prove that the configured Agent writes the expected files. `--base-url`
aims the same adapter at a local HTTP stub.

For a bounded live run, `--wait` requires both caps explicitly:

```bash
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --wait \
  --wait-seconds 120 --budget-usd 1
```

`--budget-usd` is converted to whole US cents for Anthropic's session budget. The environment
variable keeps its explicit cents name for server configuration. The backend interrupts the
session when the wall-clock cap expires. Omitting either value makes the probe refuse to start
rather than run unbounded.

Copilot uses the harness lane and its own Agent Tasks credential:

```bash
AGENT_TASKS_TOKEN=... \
npm run managed:probe -w @gamedevpl/api -- --vendor copilot --create --wait \
  --wait-seconds 120 --budget-credits 25
```

`--vendor copilot --mcp` selects the MCP prompt lane without passing a per-round bearer
credential to GitHub. The repository's Copilot MCP configuration supplies the static
connector header. A standalone probe can print task transitions and usage, but the
production channel signals and gate verdict require the app's configured store and
delivery wiring.

Gemini uses the MCP lane and a native token ceiling:

```bash
GEMINI_API_KEY=... \
MANAGED_AGENT_MCP_URL=https://www.gamedev.pl/api/mcp \
npm run managed:probe -w @gamedevpl/api -- --vendor gemini --mcp --wait \
  --wait-seconds 120 --budget-tokens 50000
```

`--vendor gemini` defaults to `gemini-3.6-flash`; `GEMINI_API_KEY` or
`MANAGED_AGENT_API_KEY` supplies the credential and `--model` overrides the model label.
The provider records native interaction usage and does not attempt to pull files from the
session.

The probe can inject a digest file while exercising this path:

```bash
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --mcp --wait \
  --wait-seconds 120 --budget-usd 1 --digest-file /path/to/engine.digest.md
```

The live registry does not yet pass a kit digest loader into the managed backend. When it
does, use `createGcsKitDigestLoader`: it reads `kits/current.json`, follows that engine ref
to `kits/<engineRef>.digest.md`, caches the result, and appends it to the configured Agent
system prompt — pinned to the same engine ref the round receives, rather than copied into
this repository.

**4. A live platform round.** With valid managed configuration deployed, create a game with
`builder: "platform"` (the default). Cloud Run should log, correlated by `issueNumber` / `slug`:

- `managed agent dispatch enabled` (once per process, at registry build)
- `managed round credential minted` — includes `credentialRef` and `mcpUrl`
- `managed round credential revoked` — on harvest/end/cancel/cleanup

```bash
node infra/gcp-read.mjs logs \
  'jsonPayload.msg="managed round credential minted" OR jsonPayload.msg="managed round credential revoked"' \
  --since 1h --limit 20
```

With `MANAGED_AGENT_DELIVERY_MODE=preview` (the default), a successful delivery ends at
`ready_for_review`, not auto-publish.

## Configuration

| Variable                            | Meaning                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `MANAGED_AGENT_VENDOR`              | Registered adapter id; required configuration must also be valid |
| `MANAGED_AGENT_API_KEY`             | Anthropic or Gemini credential. Never logged, never persisted    |
| `GEMINI_API_KEY`                    | Optional Gemini-specific credential fallback                     |
| `MANAGED_AGENT_MODEL`               | Anthropic or Gemini model label                                  |
| `AGENT_TASKS_TOKEN`                 | Copilot Agent Tasks credential                                   |
| `AGENT_TASKS_MODEL`                 | Copilot model label; defaults to the existing Copilot model      |
| `GAMES_REPO`                        | Games repository targeted by Copilot                             |
| `GAMES_PUBLISHED_REF`               | Copilot harness base ref                                         |
| `AGENT_CUSTOM_AGENT`                | Copilot custom agent name                                        |
| `MANAGED_AGENT_ID`                  | Anthropic Managed Agent resource id                              |
| `MANAGED_AGENT_ENVIRONMENT_ID`      | Anthropic Managed Environment resource id                        |
| `MANAGED_AGENT_MCP_URL`             | MCP endpoint; triggers per-round vault + `overrideTools`         |
| `MANAGED_AGENT_VAULT_IDS`           | Optional static vault ids for probe-only MCP integrations        |
| `MANAGED_AGENT_EFFORT`              | `low` / `medium` / `high`                                        |
| `MANAGED_AGENT_MAX_SECONDS`         | Hard ceiling on one session's wall clock                         |
| `MANAGED_AGENT_MAX_LIST_COST_CENTS` | Anthropic session budget, in whole cents                         |
| `MANAGED_AGENT_COPILOT_MAX_CREDITS` | Optional Copilot per-round credit ceiling                        |
| `MANAGED_AGENT_PROMPT_LANE`         | Optional default lane: `mcp`, `harness`, or `outputs`            |
| `MANAGED_AGENT_MAX_TOTAL_TOKENS`    | Optional Gemini per-round token ceiling                          |
| `MANAGED_AGENT_DELIVERY_MODE`       | `preview` (default) or `publish`                                 |
| `MANAGED_AGENT_BASE_URL`            | Override the API origin — gateways, tests                        |

Selection replaces the _platform_ backend. Builder routing, the job state machine, the
gate, Studio and self builds are untouched: a managed round is a platform round whose
agent we happen to run.

## Adding a vendor

1. Write `managed-provider-<vendor>.ts` implementing `ManagedAgentProvider`.
2. Normalize states; report usage in the vendor's native unit.
3. Declare the prompt lane (`mcp`, `harness`, or `outputs`).
4. Return paths relative to the request's `outputPath`.
5. Answer `cancelSession` honestly — `enforced: false` if the stop is cooperative.
6. `registerManagedProvider('<vendor>', factory)` at the bottom of the file.
7. Import it once where adapters are registered.

The test suite for the Anthropic adapter is the shape to copy: an injected `fetchImpl`,
no network, and assertions that the credential never reaches a URL.

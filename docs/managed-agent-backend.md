# Managed agent backend — running the builder ourselves, on a swappable vendor

> Status: ✅ **Anthropic, Gemini, Copilot, and OpenAI drivers are implemented, and all
> four dispatch over MCP.** Copilot's earlier harness lane — a git branch, a full
> repository checkout, the build channel's shell-based upload — is retired; every managed
> round now runs the same MCP-only, no-checkout contract `buildPrompt` produces. All four
> run through the managed lifecycle and record their native usage units. Production
> cutover remains gated by the MP-04 owner approval described in the migration brief.
>
> OpenAI is wired for side-by-side evaluation, not as the default: `MANAGED_AGENT_VENDOR`
> stays on its existing value after deploy, and a fresh dispatch reaches OpenAI only
> through the admin panel's per-runtime vendor override (`managedAgentVendorOverride`,
> `docs/managed-agent-backend.md#how-to-exercise-it`). That override is global, not
> per-job — flipping it changes the vendor for every fresh dispatch from that moment on,
> not a random split.
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

[`managed-agent.ts`](../apps/api/src/agent-surface/managed-agent.ts) is three capabilities and nothing
else:

| Capability | Method          | Why it is the whole surface            |
| ---------- | --------------- | -------------------------------------- |
| Start      | `startSession`  | A prompt, a model, an MCP endpoint     |
| Observe    | `getSession`    | One normalized state plus native usage |
| Stop       | `cancelSession` | With an honest `enforced` answer       |

Delivery is not part of the seam: every managed round submits its own work over MCP
(`submit_sources`), the same way an external agent does. There is nothing to pull, so
there is nothing here shaped like a harvest.

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

Copilot implements `ManagedAgentProvider` like the other two vendors — MCP-only, no
harness fallback:

| Seam capability    | Copilot's answer                                                     |
| ------------------ | -------------------------------------------------------------------- |
| `startSession`     | An Agent Task on the scratch repo (`MANAGED_AGENT_COPILOT_MCP_REPO`) |
| `getSession` usage | **Credits**, never tokens                                            |
| `cancelSession`    | Cancels the Actions run behind the task — `enforced: true`           |

GitHub's Agent Tasks API still creates a git branch as an implementation detail of every
task, on that scratch repo — the agent itself has no shell to reach it with, and nothing in
this seam ever reads it as a workspace of files.

### Interrupting a Copilot round

The agent tasks API is create/list/get only: `cancelled` is a state it reports, never one it
accepts, and there is no stop endpoint. That is not the whole picture, though — a Copilot
session **is** a GitHub Actions run on the scratch repo, dispatched by the `copilot-swe-agent`
app under the synthetic workflow path `dynamic/copilot-swe-agent/copilot`. Cancelling that run
is what the Stop button in Copilot's own UI does, and it is what `cancelSession` does here:

1. Read the task and resolve its branch (`resolveTaskBranch`).
2. List the branch's workflow runs and keep the ones whose path is the agent workflow and
   whose status is still in flight. Validation CI runs on the same branch — matching the path
   is what keeps the cancel off it.
3. `POST /repos/{owner}/{repo}/actions/runs/{id}/cancel` for each, and report `enforced: true`
   if any was accepted.

Two consequences worth knowing before reading a log:

- **A task with no branch yet cannot be stopped.** The branch artifact appears only once the
  task leaves `queued`, so an interrupt that early answers `enforced: false` — nothing is
  burning yet, and the next poll retries once there is something to stop.
- **The dispatch token needs `actions: write`** on the scratch repo (`AGENT_TASKS_TOKEN`).
  Without it dispatch still works and every cancel silently answers `enforced: false` — a
  round that blows its ceiling gets marked stopped here while GitHub keeps billing it.

Because the wall clock is enforced by the backend on observation, a round is only interrupted
as fast as it is observed: the creator's status poll and the two-minute notification sweep are
what drive it, so a closed tab does not mean an unbounded run.

### Copilot's MCP dispatch

Copilot's prompt uses the same `buildPrompt` fast contract as Anthropic and Gemini, and the
round key travels in `start({ slug, key })`. The static Copilot MCP connector authenticates
the connection only; the MCP server requires the live round key before it resolves any
round-scoped tool.

Rounds dispatch into a separate, content-free scratch repo
(`MANAGED_AGENT_COPILOT_MCP_REPO`) holding nothing but an MCP-only custom agent doc — not
the games repo. A prompt-injectable session therefore never shares a checkout with real
proprietary source; the games repo carries no Copilot MCP connector at all. The
connector-only replay test enumerates every mutating tool advertised by the MCP server and
requires refusal.

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
configuration before dispatch. Delivery is by MCP `submit_sources`, same as every other
managed vendor.

The backend budget is the shared unit-tagged shape:

```ts
{ unit: 'tokens', max: 50_000 }
```

The provider forwards that same value as Gemini's native `max_total_tokens`. If measured usage
passes the ceiling, the backend records a `ManagedBudgetStop` and reports the round as
`cancelled` with `stopReason: 'budget_reached'`; a wall-clock expiry remains `timed_out`.

## OpenAI under the seam

OpenAI dispatches on the Responses API's background lane
(`POST /v1/responses`, `background: true, store: true`), not a dedicated agent-platform
resource — there is no environment or agent id to preconfigure, which is why
`supportsSeedFiles` is `false`: there is no checkout for a seed to land in, matching
Anthropic's own no-seed answer.

The MCP endpoint is declared as a `type: 'mcp'` tool with `server_url` and the round's
bearer on that tool's own `authorization` field — the same per-round pattern as Gemini,
no static connector secret copied into the environment. **This field is easy to get
wrong: `headers: { Authorization: ... }` is also a real, accepted field on this tool
type, but it is silently dropped on the actual tool-call request** — confirmed by
fetching two live rounds' raw stored Response objects and finding `start()` reaching
the round-key-scoped MCP server with no Authorization header despite the field being
present in the request. `authorization` (a bare token string, no `Bearer ` prefix, per
OpenAI's own documented example) is the field that is actually forwarded on every call,
not just on `tools/list`. `require_approval: 'never'` is set on every MCP tool and is
never omitted: the API's default requires a human to approve each tool call, which a
background, unattended round has nobody to grant. Without it a round would sit stuck on
the first `stage_source_file` call until the wall clock killed it.

`effort` maps straight to `reasoning.effort` — unlike Gemini, which throws on any effort
override, and unlike Anthropic, which configures effort on the Agent resource instead of
per-session.

**The budget is a partial belt, not the ceiling Gemini gets.** `max_output_tokens` caps
one response's output tokens; it is not a running total across the whole agent loop the
way Gemini's `max_total_tokens` is. The provider forwards
`{ unit: 'tokens', max }` as `max_output_tokens` when a token budget is configured, but
the real enforcement is still the backend's own observed-usage `ManagedBudgetStop` —
comparing the response's reported `usage.total_tokens` against the ceiling on each poll,
same as Gemini. Both layers matter here more than they do for Gemini, because only one of
them is native.

Usage is a distinct shape (`ManagedOpenAiTokenUsage`) carrying `reasoningTokens` and
`cachedTokens` rather than Gemini's `thoughtTokens`/`toolUseTokens` — the vendor's own
units are kept, not converted to look like Gemini's. `incomplete_details.reason` decides
whether an `incomplete` status is a budget stop: only `max_output_tokens` (or the legacy
alias `max_tokens`) is treated as one, so a content-filter stop is reported plainly and
never misread as the round running out of budget.

## Delivery is always the agent's own submit_sources

A managed round delivers the way every other round does: give the session our MCP
endpoint and it runs the same session loop an external agent runs today, ending in
`submit_sources`. Nothing about delivery, validation or the gate is new, because none of
it is ours to reinvent — and there is nothing here shaped like a pull, a harvest, or an
output directory to read back. `createManagedBackend` refuses a configuration with no MCP
endpoint, because a session with nowhere to submit to can only produce work that is
discarded.

The prompt matches that contract for every vendor: `buildPrompt` always renders the
no-checkout, MCP-tool-only instructions (`docs/build-brief.md`), because there is no other
delivery shape left for it to disagree with.

### An idle session is not necessarily a stalled one

The backend nudges a session that has gone idle without delivering, because a model that
stops mid-round otherwise burns the whole wall clock doing nothing. The trap is that the
provider cannot see the build channel at all. The agent submits and calls
`end` through the channel, so by the time the vendor reports `idle` the round may already be
finished — and a preview submit sets `previewVersion`, not `deliveredVersion`, so the job's
own `hasCandidate` flag is still false. A nudge at that moment opens a second round on a job
that is already gating, and the agent has to be interrupted by hand.

So the guard reads the round, not just the session, through an injected `readSignals`. That
is the same seam the self backend takes — a reader handed in by the reconciler rather than a
store dependency inside the backend — but not the same payload: `ManagedRoundSignals` also
carries `previewVersion` and `agentEndedAt`, neither of which the self backend consults. Two
conditions independently suppress the nudge: a delivery exists, or the agent
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

## How to exercise it

`registerSubmissionRoutes` builds the platform registry via
`createAgentBackendRegistryFromEnv`. A managed adapter is selected only when
`MANAGED_AGENT_VENDOR` and its required configuration are valid — **since MP-04, that is
the only way to get a platform backend.** The direct Copilot backend and its unconditional
`AGENT_TASKS_TOKEN`-alone fallback were retired: `MANAGED_AGENT_VENDOR=copilot` must be set
explicitly, with `AGENT_TASKS_TOKEN` supplying its credential, or platform dispatch is
unavailable regardless of which secrets are present. An explicit `agentBackends.platform`
still wins over the environment registry.

There are four levels of test:

**1. The suites.** Fake provider, no network:

```bash
npx vitest run apps/api/src/agent-surface/managed-agent.test.ts apps/api/src/agent-surface/managed-backend.test.ts \
  apps/api/src/agent-surface/managed-provider-anthropic.test.ts apps/api/src/agent-surface/managed-provider-gemini.test.ts \
  apps/api/src/agent-surface/managed-provider-openai.test.ts apps/api/src/delivery/build-prompt.test.ts
```

**2. The probe.** One whole round through the real backend, over MCP, requires a real
`--vendor` — there is no stub shape left to run without one:

```bash
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --prompt   # the brief buildPrompt renders
```

It polls twice on purpose, because the first poll is a live session and the second is a
parked one — the difference between "still working" and "idle" is the thing most worth
watching.

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
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --wait \
  --wait-seconds 120 --budget-usd 1
```

The probe uses `ANTHROPIC_API_KEY` for this vendor and defaults to `claude-sonnet-5`;
`MANAGED_AGENT_API_KEY` or `--model` overrides either value. `MANAGED_AGENT_ID` and
`MANAGED_AGENT_ENVIRONMENT_ID` identify the preconfigured Anthropic resources.
`MANAGED_AGENT_MCP_URL` makes the adapter create a round-scoped vault containing the build
capability for that exact URL; the agent never sees the capability and the vault is
archived when the round ends. `MANAGED_AGENT_VAULT_ID` and `MANAGED_AGENT_VAULT_IDS` remain
available only for probe-only static integrations.

Every run follows the production path: the probe mints a managed MCP opener
(`mintManagedMcpOpener`), puts it on the brief as `mcpOpenerToken`, passes
`mcpBearerCredential` into the backend, and sets `overrideTools` so the session's tool list
is the MCP endpoint. After dispatch the probe prints `credentialRef` (the vault id) and
archives it on cancel/cleanup. The MCP URL comes from `--mcp-url` or `MANAGED_AGENT_MCP_URL`
(default `https://www.gamedev.pl/api/mcp`). That proves the vendor accepted the per-round
vault (Anthropic) or bearer header (Gemini). Authenticating `mcp:start` against the live
platform MCP still needs a real Firestore job and an opener signed with the same
`SUBMISSION_TOKEN_SECRET` the API uses — export that secret into the probe environment when
you have both. Without it the probe uses a local opener secret so vault creation still
works and the transcript's `mcp:start` line will show an auth error rather than "no
credential stored for this server URL".

It creates an initial event, mints the per-round vault, dispatches, polls twice, interrupts
and deletes the session. `--base-url` aims the same adapter at a local HTTP stub.
`--budget-usd` is converted to whole US cents for Anthropic's session budget; the backend
interrupts the session when the wall-clock cap expires. Omitting either `--wait` value makes
the probe refuse to start rather than run unbounded.

Copilot dispatches into the scratch repo (`MANAGED_AGENT_COPILOT_MCP_REPO`) and its own
Agent Tasks credential:

```bash
AGENT_TASKS_TOKEN=... \
MANAGED_AGENT_COPILOT_MCP_REPO=gamedevpl/scratchpad \
npm run managed:probe -w @gamedevpl/api -- --vendor copilot --wait \
  --wait-seconds 120 --budget-credits 25
```

The repository's Copilot MCP configuration supplies the static connector header; the probe
never passes a per-round bearer credential to GitHub for this vendor. A standalone probe
can print task transitions and usage, but the production channel signals and gate verdict
require the app's configured store and delivery wiring.

Gemini uses a native token ceiling:

```bash
GEMINI_API_KEY=... \
MANAGED_AGENT_MCP_URL=https://www.gamedev.pl/api/mcp \
npm run managed:probe -w @gamedevpl/api -- --vendor gemini --wait \
  --wait-seconds 120 --budget-tokens 50000
```

`--vendor gemini` defaults to `gemini-3.8-flash`; `GEMINI_API_KEY` or
`MANAGED_AGENT_API_KEY` supplies the credential and `--model` overrides the model label.

OpenAI also uses a native token ceiling, forwarded as `max_output_tokens` — a partial
guard, not the running total Gemini's `max_total_tokens` gives natively (see "OpenAI
under the seam" above):

```bash
OPENAI_API_KEY=... \
MANAGED_AGENT_MCP_URL=https://www.gamedev.pl/api/mcp \
npm run managed:probe -w @gamedevpl/api -- --vendor openai --wait \
  --wait-seconds 120 --budget-tokens 50000 --model <the confirmed Luna model id>
```

Unlike every other vendor, OpenAI has **no built-in default model** — `--model` or
`MANAGED_AGENT_OPENAI_MODEL` is required every time. That is deliberate: the model id was
confirmed once against a live round rather than sourced from documentation, so a silent
fallback would risk quietly dispatching a different model than the one actually verified.
`OPENAI_API_KEY` or `MANAGED_AGENT_API_KEY` supplies the credential.

The probe can inject a digest file while exercising this path:

```bash
npm run managed:probe -w @gamedevpl/api -- --vendor anthropic --wait \
  --wait-seconds 120 --budget-usd 1 --digest-file /path/to/engine.digest.md
```

The live registry does not yet pass a kit digest loader into the managed backend. When it
does, use `createGcsKitDigestLoader`: it reads `kits/current.json`, follows that engine ref
to `kits/<engineRef>.digest.md`, caches the result, and appends it to the configured Agent
system prompt — pinned to the same engine ref the round receives, rather than copied into
this repository.

**4. A live platform round.** With valid managed configuration deployed, create a game with
`builder: "platform"` (the default). Cloud Run should log, correlated by `jobId` / `slug`:

- `managed agent dispatch enabled` (once per process, at registry build)
- `managed round credential minted` — includes `credentialRef` and `mcpUrl`
- `managed round credential revoked` — on submit/end/cancel/cleanup

```bash
node infra/gcp-read.mjs logs \
  'jsonPayload.msg="managed round credential minted" OR jsonPayload.msg="managed round credential revoked"' \
  --since 1h --limit 20
```

With `MANAGED_AGENT_DELIVERY_MODE=preview` (the default), a successful delivery ends at
`ready_for_review`, not auto-publish.

## Configuration

| Variable                                 | Meaning                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MANAGED_AGENT_VENDOR`                   | Registered adapter id; required configuration must also be valid                                                     |
| `MANAGED_AGENT_API_KEY`                  | Anthropic credential, or a generic fallback for the default vendor's Gemini/OpenAI key                               |
| `GEMINI_API_KEY`                         | Gemini-specific credential; takes priority over the generic fallback                                                 |
| `OPENAI_API_KEY`                         | OpenAI-specific credential; takes priority over the generic fallback                                                 |
| `MANAGED_AGENT_MODEL`                    | Anthropic model label                                                                                                |
| `MANAGED_AGENT_GEMINI_MODEL`             | Gemini model label; falls back to the adapter's built-in default                                                     |
| `MANAGED_AGENT_OPENAI_MODEL`             | OpenAI model label — **required for OpenAI; never defaulted**, see "How to exercise it"                              |
| `AGENT_TASKS_TOKEN`                      | Copilot Agent Tasks credential — needs `actions: write` to interrupt                                                 |
| `AGENT_TASKS_MODEL`                      | Copilot model label; defaults to the existing Copilot model                                                          |
| `MANAGED_AGENT_ID`                       | Anthropic Managed Agent resource id                                                                                  |
| `MANAGED_AGENT_ENVIRONMENT_ID`           | Anthropic Managed Environment resource id                                                                            |
| `MANAGED_AGENT_MCP_URL`                  | MCP endpoint — **required, every vendor**; triggers the per-round vault + `overrideTools` on Anthropic/Gemini/OpenAI |
| `MANAGED_AGENT_VAULT_IDS`                | Optional static vault ids for probe-only MCP integrations                                                            |
| `MANAGED_AGENT_EFFORT`                   | `low` / `medium` / `high`                                                                                            |
| `MANAGED_AGENT_MAX_SECONDS`              | Hard ceiling on one session's wall clock — **required, every vendor**                                                |
| `MANAGED_AGENT_MAX_LIST_COST_CENTS`      | Anthropic session budget, in whole cents                                                                             |
| `MANAGED_AGENT_COPILOT_MAX_CREDITS`      | Optional Copilot per-round credit ceiling                                                                            |
| `MANAGED_AGENT_COPILOT_MCP_REPO`         | The scratch repo Copilot dispatches into — **required for Copilot**                                                  |
| `MANAGED_AGENT_COPILOT_MCP_BASE_REF`     | Base ref in the scratch repo; defaults to `main`                                                                     |
| `MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT` | Custom agent there; defaults to `game-builder-mcp`                                                                   |
| `MANAGED_AGENT_MAX_TOTAL_TOKENS`         | Optional Gemini or OpenAI per-round token ceiling — shared variable, whichever vendor is selected                    |
| `MANAGED_AGENT_DELIVERY_MODE`            | `preview` (default) or `publish`                                                                                     |
| `MANAGED_AGENT_BASE_URL`                 | Override the API origin — gateways, tests                                                                            |

Copilot dispatches into a separate, content-free scratch repo — never the games repo —
holding nothing but an MCP-only custom agent doc, so a prompt-injectable session never
shares a checkout with real source. Both `MANAGED_AGENT_MCP_URL` and
`MANAGED_AGENT_COPILOT_MCP_REPO` are required for Copilot to build at all; missing either
one fails startup rather than falling back to anything else.

Selection replaces the _platform_ backend. Builder routing, the job state machine, the
gate, Studio and self builds are untouched: a managed round is a platform round whose
agent we happen to run.

## Adding a vendor

1. Write `managed-provider-<vendor>.ts` implementing `ManagedAgentProvider`.
2. Normalize states; report usage in the vendor's native unit.
3. Declare an MCP endpoint at dispatch — there is no other delivery shape to choose.
4. Answer `cancelSession` honestly — `enforced: false` if the stop is cooperative.
5. `registerManagedProvider('<vendor>', factory)` at the bottom of the file.
6. Import it once where adapters are registered.

The test suite for the Anthropic adapter is the shape to copy: an injected `fetchImpl`,
no network, and assertions that the credential never reaches a URL.

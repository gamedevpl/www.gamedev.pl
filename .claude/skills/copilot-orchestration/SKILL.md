---
name: copilot-orchestration
description: Delegate work to GitHub Copilot's remote coding agent — either via the Agent tasks REST API (no issue needed; prefer this when scripting) or by assigning an issue to the Copilot bot — then verify and merge what comes back. Use when offloading well-specified, self-contained coding tasks to run remotely instead of doing them locally, when driving or polling Copilot sessions programmatically, or when choosing what is and isn't suitable to delegate.
---

# Orchestrating remote GitHub Copilot coding sessions

Copilot's coding agent runs on GitHub's infrastructure, not yours. There are **two** ways to
dispatch work, and the newer one is better for anything programmatic:

1. **Agent tasks REST API** (`POST /agents/repos/{owner}/{repo}/tasks`) — no issue, no label,
   no bot assignment. Prefer this whenever you are scripting. See
   [the Agent tasks API section](#the-agent-tasks-rest-api-prefer-this-when-scripting).
2. **Assigning an issue to the Copilot bot** — the original path, still fine when a human
   issue is wanted as the artifact. Documented from
   [The dispatch procedure](#the-dispatch-procedure) onward.

Either way it is the cheapest way to get real work done without consuming local model quota —
but only for the right tasks, and only if you verify what comes back.

## When to delegate (and when not to)

Delegate when the task is:

- **Self-contained code with a local test oracle.** A green gate (`lint`/`type-check`/`test`/
  `build`) is what makes a returned PR verifiable without trusting it.
- **Well-specified.** You can write down the files, the contract, and what "done" means.
- **Additive**, not architecture-defining.

Do **not** delegate when:

- **The hard part is empirical** — needing real credentials, a running daemon, Docker,
  external services, or iterating against live behaviour. Copilot's sandbox can't do this, so
  it returns confident, plausible, **never-executed** code. Worst outcome for infra work.
- **Secrets are involved.** Never route credential handling through an autonomous PR agent.
- **It's a security boundary or a core architectural decision.** Do those yourself.

Rule of thumb: if verification requires a human judgement call rather than a passing test
suite, keep it.

## The Agent tasks REST API (prefer this when scripting)

Public preview, REST API version `2026-03-10`. **Verified against `gamedevpl` on 2026-07-29**
— every behaviour below was observed, not read off the docs, and where the two disagree the
observation is noted.

```bash
curl -sS -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  -H "Authorization: Bearer $PAT" \
  "https://api.github.com/agents/repos/OWNER/REPO/tasks" \
  --data '{"prompt":"...","base_ref":"main","create_pull_request":false}'
```

Five endpoints: `POST /agents/repos/{o}/{r}/tasks` (start), `GET` the same path (list, filter
by `state`/`since`/`creator_id`/`is_archived`), `GET .../tasks/{task_id}` (one task **with
`sessions[]`**), plus `GET /agents/tasks` and `GET /agents/tasks/{task_id}` across all repos.

`POST` body: `prompt` (the only required field), `base_ref`, `head_ref`,
`create_pull_request`, `model`, `custom_agent`.

**Auth — the constraint that bites automation.** User-to-server tokens **only**: a PAT
(fine-grained needs `Agent tasks: read` to list / `read and write` to start; classic needs
`repo`), an OAuth app token, or a GitHub App **user** token. **GitHub App _installation_
tokens are not supported.** A server-side orchestrator must therefore hold a human's token —
there is no way to run this as a pure machine identity.

**The gh CLI works — verified 2026-07-31.** `gh`'s stored credential is an OAuth app
user-to-server token, and a six-task dispatch (the seed-spike A/B) ran entirely through
`gh api -H "X-GitHub-Api-Version: 2026-03-10" agents/repos/{o}/{r}/tasks` with no PAT.
For interactive/local scripting prefer it: auth is handled for you and no token touches a
shell variable. Pass the POST body with `--input file.json` (not `-f` flags) so
`create_pull_request` stays a real boolean.

**Licensing.** Available on all _paid_ Copilot plans; the agent-tasks API reached Pro/Pro+/Max
in June 2026. The REST reference still carries a stale line restricting `POST` to
Business/Enterprise — it is wrong; a personal paid plan works. No Enterprise seat needed.

### Gotchas, all observed

- ⚠️ **`create_pull_request` does NOT default to `false`.** The docs say it does. Omitting it
  opened a PR; setting it explicitly to `false` did not. **Always send it explicitly.**
- ⚠️ **`head_ref` only works when that branch has an OPEN PR.** The docs' phrasing is literal
  — it "looks up open PR context for `head_ref` targeting `base_ref`". With no open PR the
  parameter is **silently ignored** and the agent branches fresh from `base_ref`; you get no
  error, just work on the wrong branch. **Always read the branch back from the response's
  artifacts instead of assuming the one you asked for.** To do follow-up rounds on one branch,
  make sure a PR is open on it first (create it yourself if `create_pull_request` was `false`).
  With a PR present, resumption is reliable: verified appending to the same branch **and the
  same PR id**, while still sending `create_pull_request: false` — that flag neither tears
  down nor refuses an existing PR, so no flag juggling is needed between rounds.
- ⚠️ **Auto model selection is not stable across tasks.** With `model` omitted, two
  back-to-back tasks resolved to `claude-sonnet-4.6` and `gpt-5.4` respectively. If you are
  comparing runs, measuring cost/latency, or want reproducibility, **pin `model` explicitly**
  and record the namespaced string that comes back.
- **A follow-up is a new _task_, not a new session on the old one.** Sessions are the
  within-task view; N rounds of work on one branch means N task IDs to track.
- **`model` echoes back namespaced.** Request `claude-sonnet-4.6`, read back
  `sweagent-capi:claude-sonnet-4.6`. Omitting it means auto-selection, which reports as
  `"auto"` until a session starts and then resolves to a concrete model. Don't compare
  request and response strings for equality.
- **GitHub rewrites `name` into a human title.** A prompt of "Fix any typo you find in
  games/x/SPEC.md…" came back as "Correcting typos in bubble pop rush specification". Useful
  for UI labels; do not rely on `name` echoing your prompt (`sessions[].prompt` does).
- **`artifacts[]` is how you learn what happened.** A `branch` entry carries
  `{base_ref, head_ref}`; a `pull` entry carries `{id, global_id}`. Both appear only once the
  task has progressed — a freshly-created task returns `artifacts: []` and
  `session_count: 0`. Poll `GET .../tasks/{id}` rather than trusting the create response.
- **There is no cancel/stop endpoint.** `cancelled` exists as a _state_, but the API is
  create/list/get only; stopping is a UI action that ends the underlying Actions run. Plan for
  cooperative cancellation (tell the agent to stop through whatever channel it reads) plus
  discarding the output.
- **`custom_agent`** names a `.github/agents/<name>.agent.md` file in the repo — the clean way
  to pin conventions and read-only boundaries for scripted dispatch.

**States**: `queued`, `in_progress`, `completed`, `failed`, `idle`, `waiting_for_user`,
`timed_out`, `cancelled`. This is a far better completion signal than the `[WIP]`-title
heuristic below — use it whenever you have the task ID.

**Timing observed**: a trivial one-file task went `queued` → `completed` in ≈4.5 minutes.
A freshly created task often returns `artifacts: []` and `session_count: 0` while still
`queued` — the session has been accepted but not started. gamedev.pl Studio maps that
stretch to job phase `dispatched` and only advances to `building` on `in_progress`
(see BYOCA skill "Platform session boot").

### Dumping a session's generation log

**Verified 2026-08-01.** There are two sources at different fidelities. **Reach for the task
page first** — the Actions log is a fallback for when you want machine-readable timing rather
than what the agent actually saw.

`GET /agents/.../sessions/{id}/logs` does not exist on `api.github.com` (404); the endpoint
the runner posts to is `https://api.individual.githubcopilot.com/agents/sessions/{id}/logs`,
which wants a Copilot token, not a PAT. `gh api /copilot_internal/v2/token` did not yield one.

#### The full transcript — the task page

`https://github.com/<owner>/<repo>/tasks/<id>` has prose, full commands, complete stdout and
real exit codes. ⚠️ **It is collapsed, and text-extraction tools miss it entirely.** Each step
is a separate `aria-expanded="false"` button and there are no `<details>` elements, so
`get_page_text` returns only the prompt and the file diff — it reads as "this task has no
transcript at all", which is what led one session to wrongly conclude none existed. Expand
first:

```js
document.querySelectorAll('button[aria-expanded="false"]').forEach((b) => b.click());
```

On a 136-turn session that took `document.body.innerText` from ~10 KB to **~200 KB**. It
carries what the Actions log lacks: the step titles the agent wrote for itself ("Find where
unknown music error comes from"), every untruncated command, **complete stdout**, and
`<shellId: … completed with exit code N>` — the real pass/fail. Dump it to disk with a Blob
download rather than reading 200 KB back through a tool result.

Two traps: the browser extension **blocks returned slices containing long token-like strings**,
so redact (`replace(/[A-Za-z0-9_-]{40,}/g,'[REDACTED]')`) before returning any text overlapping
a prompt that carries a build token. And this page is the only copy — nothing on
`api.github.com` serves it.

#### The metadata transcript — the Actions run

```bash
gh api "repos/OWNER/REPO/actions/runs?created=YYYY-MM-DD" \
  --jq '.workflow_runs[] | select(.name=="Running Copilot cloud agent") | "\(.id) \(.head_branch)"'
gh api "repos/OWNER/REPO/actions/runs/RUN_ID/logs" > logs.zip && unzip -q logs.zip -d run-logs
```

Match the run by `head_branch` against the task's `artifacts[].data.head_ref`. `0_copilot.txt`
holds the whole session: setup, the firewall rule dump, and — from the line
`[cca-engine] Created new session <id>` onward — a turn-by-turn event stream:

| event                                  | carries                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `turn=N assistant.usage`               | model, cumulative `input=`, `output=` tokens for that turn                                 |
| `turn=N assistant.message`             | **char count only**, plus the number of tool calls                                         |
| `turn=N tool.execution_start`          | tool name, and for `bash` the command **truncated at ≈120 chars**                          |
| `turn=N tool.execution_complete`       | `success=true` / `success=false` — ⚠️ means _bash launched_, not that the command exited 0 |
| `turn=N user.message` / `session.idle` | prompt/turn boundaries                                                                     |
| `PR:` / `Sent pr_summary`              | final title and description lengths                                                        |

So the Actions log is a **metadata transcript, not a transcript**: the shape of the run, never
the model's prose or the tool output. Use it when you want timing, token spend per turn, or a
machine-readable tool sequence. Strip timestamps and ANSI, then filter:

```bash
sed -e 's/^[0-9T:.Z-]*Z //' -e 's/\x1b\[[0-9;]*m//g' run-logs/0_copilot.txt \
  | grep -E '^\[cca-engine\] turn=' | grep -v checkQuota
```

Two things worth reading every time: `success=false` lines, and the
`⚠️ Warning: I tried to connect to the following addresses, but was blocked by firewall rules`
block near the end — headless-Chrome playtests routinely trip it.

### Two environment traps

- **Claude Code sessions cannot reach `/agents/*`.** The session's API proxy serves only
  `repos/{owner}/{repo}/...` REST paths plus a pinned set of GraphQL operations, so these
  calls 403 **at the proxy, not at GitHub** (the error names `docs.anthropic.com`, which is
  the tell). Reads of session status are still available via the GitHub MCP tool
  `get_copilot_job_status`; anything else has to run outside the session.
- **zsh executes pasted `#` comment lines.** `INTERACTIVE_COMMENTS` is off by default in
  interactive zsh, so a pasted `# (c) check the thing` runs `#` as a command and reads `(c)`
  as a glob qualifier → `zsh: number expected` / `unknown file attribute`. Harmless but
  confusing. Give copy-paste blocks **without** comment lines, and don't use bash arrays
  (`H=(-H ...)`) in them either.

## The dispatch procedure

_(The issue-assignment path. Still valid; prefer the Agent tasks API above for scripting.)_

### 1. Write the issue like a spec

Include: the exact scope (files/modules), the contract, what's **explicitly out of scope**,
the acceptance gate, and any invariants that must not change. Point at your agent
instructions file (e.g. `.github/copilot-instructions.md`) so conventions are picked up.

Over-specifying "out of scope" is worth it — it prevents scope creep you'd otherwise have to
review out.

```bash
gh issue create --title "..." --body "..."
```

### 2. Assign to the Copilot bot — via GraphQL, not the REST API

⚠️ The REST assignees endpoint does **not** list the Copilot bot. Assignment goes through
GraphQL. Find the bot and the issue node id, then assign:

```bash
# Find the bot (login is typically copilot-swe-agent, but resolve it rather than assuming)
gh api graphql -f query='
query { repository(owner: "OWNER", name: "REPO") {
  suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 10) {
    nodes { login __typename ... on Bot { id } ... on User { id } }
  } } }'

# Get the issue node id
gh api graphql -f query='
query { repository(owner: "OWNER", name: "REPO") { issue(number: N) { id } } }'

# Assign (include yourself too if you want to stay assigned)
gh api graphql -f query='
mutation { replaceActorsForAssignable(
  input: {assignableId: "ISSUE_NODE_ID", actorIds: ["BOT_ID"]}
) { assignable { ... on Issue { number assignees(first: 5) { nodes { login } } } } } }'
```

To **re-trigger** a fresh session on the same issue, unassign then reassign.

### 3. ⚠️ Confirm the base branch — the biggest gotcha

> **Now avoidable.** Both dispatch paths accept an explicit base branch: `base_ref` on the
> Agent tasks API, and an `agentAssignment` input (`targetRepositoryId`, `baseRef`,
> `customInstructions`, `customAgent`, `model`) on the `createIssue` / `updateIssue` /
> `addAssigneesToAssignable` / `replaceActorsForAssignable` GraphQL mutations — the latter
> requires the header `GraphQL-Features: issues_copilot_assignment_api_support,coding_agent_model_selection`.
> Pass the base branch explicitly and this whole class of failure disappears. The rest of this
> section applies when you did not.

**Copilot forks from the repository's DEFAULT branch, not from whatever branch the issue text
mentions.** If your work lives on a non-default branch, it will build on the wrong base — and
won't even see your `.github/copilot-instructions.md` if that file only exists on your branch.

Symptom: the PR recreates things that already exist, or its diff is enormous and unrelated.

Two fixes:

- **Change the repo's default branch** to your working branch (simplest; makes every future
  dispatch land correctly), **or**
- Invoke via an `@copilot` comment on a PR already based on the right branch.

Always verify before reviewing:

```bash
gh pr view N --json baseRefName,headRefName
```

If the base is wrong, **close the PR** — don't try to salvage it. Fix the default branch and
re-dispatch.

### 4. Wait for it to finish

Poll patiently with real `sleep` between checks. Signals:

- Title initially carries a `[WIP]` prefix; **losing the prefix means Copilot considers it
  done**. It may still be marked draft — draft status is not a completion signal either way.
- ⚠️ `gh pr list --search "<issue number>"` often **doesn't match**, because the PR title and
  body may not contain the issue number. Use `gh pr list --state open --json number,title,baseRefName,headRefName`.
- ⚠️ **Branch names vary** and are not a reliable identifier. Observed both
  `copilot/<default-branch-name>` and descriptive `copilot/<task-slug>` forms across runs, so
  match on the PR's content, not on an expected branch name.
- **It won't ping you.** Nothing notifies you when the PR is ready, so either poll deliberately
  or hand the babysitting to a subagent — otherwise finished PRs sit unmerged and forgotten.

### 5. Verify independently — never trust the PR's own claims

GitHub's CI check on Copilot-authored PRs frequently sits in **`action_required`** (a repo/org
policy gating bot-triggered workflow runs) and therefore **never actually runs**. That is not
a failure — but it means there is **no CI signal**, so you must produce one yourself.

Note `gh api .../actions/runs/<id>/approve` returns 403 for these — it only applies to fork
PRs. Approving them needs the Actions UI or a settings change.

Verify in a **throwaway clone outside your working directory**:

```bash
git clone --branch <head-branch> --single-branch <repo-url> /tmp/pr-N-verify
cd /tmp/pr-N-verify && npm install
npm run type-check && npm run lint && npm run test && npm run build
```

Then review the diff against the spec:

```bash
gh pr diff N --name-only
gh pr diff N
```

Check: scope matches the issue, **project invariants untouched**, no secrets, no scope creep.

**For security- or correctness-critical logic, exercise the code yourself** — don't infer
behaviour from the fact that its own tests pass. Import the built module in the verify clone
and run the properties you actually care about against real project data. For a credential
scanner that meant checking real generated bundles for false positives (the failure mode that
would make it useless) rather than only that its own fixtures matched. Agent-written tests
tend to assert what the implementation does, which makes them weak evidence that it does the
_right_ thing.

### 6. Merge

```bash
gh pr ready N          # if it's still a draft
gh pr merge N --squash --delete-branch --subject "..." --body "..."
```

State in the merge body that you verified independently, and note the `action_required` quirk
so a passing-looking-but-unrun CI check isn't mistaken for real signal later.

## Never verify inside your own working directory

Do not `git checkout` the PR branch, `git merge` it, or otherwise mutate the checked-out repo
you (or a parallel agent) are working in. Doing so silently reverts uncommitted work and can
land your commits on the wrong branch.

**Always use a throwaway clone or worktree under `/tmp`.** This matters even more when
multiple agents run in parallel — a shared working directory is the single biggest source of
cross-agent damage.

## Delegating the babysitting itself

Watching a PR to completion is mostly waiting, so it's a good candidate for a subagent. When
you do, state explicitly in its prompt:

- Verify in a throwaway clone under `/tmp`; the main working directory is **off-limits** for
  any state-mutating git command.
- The `action_required` CI state is expected, not a failure.
- Which invariants must not change.
- What to do if verification fails: report, don't merge.

⚠️ Be aware: a legitimate mid-task correction you send is **indistinguishable from a prompt
injection attempt** from the subagent's perspective. A well-behaved subagent may refuse it and
say so. That's correct behaviour — the fix is to avoid needing corrections (scope the prompt
properly up front), not to demand compliance.

## Mandatory: keep this skill current

**This skill is a living record, and updating it is part of using it.** Every time you run
this workflow and learn something it didn't tell you, you must update this file **in the same
session, before you finish** — not "later".

Update it when:

- A step here was **wrong, stale, or incomplete** — correct it, and say what the real
  behaviour was.
- You hit a **gotcha that cost you time** — add it, with the symptom you'd have recognised it
  by. The default-branch trap and the `action_required` CI state are both here because they
  cost a wasted PR and a confused debugging session respectively.
- An **API or CLI changed** (GitHub's assignment mechanism especially) — record what actually
  works now, verified, not what you assume.
- A step turned out to be **unnecessary** — delete it. Stale ceremony is a cost too.
- You discovered a task type that **should or shouldn't** be delegated — refine that guidance
  with the concrete reason.

Record **observed behaviour, not guesses**. If you couldn't confirm something, mark it as
unverified rather than stating it plainly.

Treat _"I had to work something out that this skill should have told me"_ as a defect in the
skill. Fixing it is not optional.

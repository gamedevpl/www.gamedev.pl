---
name: copilot-orchestration
description: Delegate work to GitHub Copilot's remote coding agent by creating an issue and assigning it to the Copilot bot, then verify and merge the PR it opens. Use when offloading well-specified, self-contained coding tasks to run remotely instead of doing them locally — including choosing what is and isn't suitable to delegate.
---

# Orchestrating remote GitHub Copilot coding sessions

Copilot's coding agent runs on GitHub's infrastructure, not yours. You dispatch work by
**assigning an issue to the Copilot bot**; it opens a pull request. This is the cheapest way
to get real work done without consuming local model quota — but only for the right tasks, and
only if you verify what comes back.

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

## The dispatch procedure

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

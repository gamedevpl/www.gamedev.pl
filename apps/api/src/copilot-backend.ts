// The GitHub Copilot backend: dispatch through the agent tasks API.
//
// What this replaces, on the games repo side: `assign-copilot.yml` (a workflow whose only
// job was to assign a bot the REST API will not list), `relay-creator-feedback.yml` (a
// second workflow re-posting our comments under a licensed human's identity because
// bot-authored @copilot mentions are silently dropped), and the two PATs both need. The
// tasks API takes a prompt directly, so none of that indirection has to exist.
//
// The games repo stays Copilot's **harness**, not its deliverable: it is cloned for
// GameKit, the tooling and published games as context, and the agent's output goes out
// over the build channel instead of into a commit somebody merges.

import type { AgentBackend, BuildBrief, DispatchResult, SeedFiles } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import {
  creditsFromUsageAmount,
  resolveTaskBranch,
  stageAndCleanupSeedBranch,
  type AgentTaskModel,
  type AgentTasksClient,
} from './agent-tasks.js';
import type { GitHubClient } from './github-client.js';
import type { AgentObservation } from './job-state.js';

export { seedBranchName } from './agent-tasks.js';

export interface CopilotBackendOptions {
  tasks: AgentTasksClient;
  /** Deleting a spent workspace (see `cleanup`) and committing a seed (see `dispatch`). */
  github: Pick<GitHubClient, 'deleteBranch' | 'createBranchWithFiles'>;
  /** Branch the harness is read from. */
  baseRef?: string;
  /**
   * Pinned per dispatch. Never omitted: auto-selection varies between tasks, so leaving
   * it out makes cost, latency and quality unattributable — and any A/B meaningless.
   */
  model?: AgentTaskModel;
  /** `.github/agents/<name>.agent.md` carrying the standing rules. */
  customAgent?: string;
  /**
   * Whether a dispatch opens a pull request.
   *
   * Defaults to false: delivery is by upload, so a PR is not part of the contract. It
   * becomes necessary only for a revision round, which `resume` arranges on demand —
   * see the comment there for why that is not simply left on.
   */
  createPullRequest?: boolean;
  log?: { warn: (context: object, message: string) => void };
}

const DEFAULT_MODEL: AgentTaskModel = 'claude-sonnet-4.6';

export function createCopilotBackend(options: CopilotBackendOptions): AgentBackend {
  const baseRef = options.baseRef ?? 'main';
  const model = options.model ?? DEFAULT_MODEL;
  const createPullRequest = options.createPullRequest ?? false;

  // Stages the draft on a branch, or returns null to build unseeded.
  async function stageSeed(issueNumber: number, seed: SeedFiles): Promise<string | null> {
    return stageAndCleanupSeedBranch({
      github: options.github,
      issueNumber,
      baseRef,
      slug: seed.slug,
      files: seed.files.map((file) => ({ path: `games/${seed.slug}/${file.path}`, content: file.content })),
      onStageError: (error) =>
        options.log?.warn(
          { err: error, issueNumber, slug: seed.slug },
          'could not stage the generated seed, dispatching unseeded',
        ),
    });
  }

  return {
    name: 'copilot',

    /**
     * Starts a build, from a generated draft when the brief carries one.
     *
     * **The seed is delivered as `base_ref`, not `head_ref`.** The spike that proved
     * seeding worth doing used `head_ref` — resume the branch the draft is on — and that
     * is the wrong mechanism here for two reasons the spike could not see. `head_ref` is
     * silently ignored unless the branch has an open pull request, so it would put a PR
     * back into a delivery path deliberately built to have none; and it means "continue
     * this work", which is a claim about a draft that has never been run. `base_ref` is
     * honoured unconditionally, needs no pull request, and says the true thing: this is
     * where your workspace starts.
     *
     * The seed branch is cut from the harness pin at dispatch, so a seeded workspace is
     * exactly as current as an unseeded one — the staleness that ruled out branch
     * resumption for revision rounds (see `resume`) cannot arise here.
     *
     * A seed that cannot be staged is not an error: the build dispatches unseeded, which
     * is what every build did before seeding existed.
     */
    async dispatch(brief: BuildBrief): Promise<DispatchResult> {
      const seedBranch = brief.seed ? await stageSeed(brief.issueNumber, brief.seed) : null;
      // The brief drives the prompt, so a seed that failed to stage must not leave the
      // agent being told about a draft that is not in its checkout.
      const effectiveBrief = seedBranch ? brief : { ...brief, seed: undefined };

      const task = await options.tasks.startTask({
        prompt: buildPrompt(effectiveBrief),
        baseRef: seedBranch ?? baseRef,
        model,
        createPullRequest,
        customAgent: options.customAgent,
      });
      // A fresh task has no branch yet; the reconciler fills it in on first observation.
      return {
        ref: task.id,
        workspace: resolveTaskBranch(task) ?? undefined,
        ...(seedBranch ? { seedWorkspace: seedBranch } : {}),
      };
    },

    /**
     * A revision round starts a *fresh* workspace and restores the game into it.
     *
     * Continuing the previous branch is the obvious implementation and the wrong one.
     * That branch was cut when the build started, so its GameKit, tooling and harness
     * are however old the job is — and a game revised against a stale engine is exactly
     * the drift the gate exists to catch, except self-inflicted, on every round, growing
     * with the age of the build. It also needed an open pull request as resumption
     * context, because the agent tasks API ignores `head_ref` without one, which put a
     * pull request back into a delivery path built to have none.
     *
     * Branching from `baseRef` instead gives every round the current engine, and the
     * brief's `npm run restore` brings the game itself back from the store — exactly,
     * because versions are immutable. Continuity comes from the delivery, which is the
     * thing that was actually reviewed, rather than from a branch that merely happens
     * to still exist.
     *
     * The cost is honest: work an agent committed but never delivered does not survive
     * the round. That is the right trade — undelivered work was never gated, never
     * previewed, and never seen by the creator whose feedback this is answering.
     */
    async resume(brief: BuildBrief): Promise<DispatchResult> {
      return this.dispatch(brief);
    },

    /**
     * Deletes the workspace once the job has no further use for it.
     *
     * Safe because the branch never held anything authoritative: the game is in the
     * store, the gate reads it from there, and publication bakes from there. What is
     * left behind is one branch per round per game, forever, in a repository people
     * also read.
     */
    async cleanup(previous: DispatchResult): Promise<void> {
      if (!previous.workspace) return;
      await options.github.deleteBranch(previous.workspace);
    },

    async observe(ref: string, { hasCandidate }): Promise<AgentObservation | null> {
      const task = await options.tasks.getTask(ref);
      if (!task) return null;
      // The branch is reported here and nowhere else: `startTask` answers before the
      // agent has created one, so a dispatch that does not come back and ask never
      // learns where its own work lives.
      const workspace = resolveTaskBranch(task);
      // Sum every session that has reported usage. A task can host more than one
      // session; the ledger entry is keyed by the task ref, so the figure has to be
      // the whole bill for that dispatch, not just the latest run.
      const usageTotal = task.sessions.reduce((sum, session) => (session.usage ? sum + session.usage.amount : sum), 0);
      const hasUsage = task.sessions.some((session) => session.usage);
      return {
        state: task.state,
        hasCandidate,
        ...(workspace ? { workspace } : {}),
        ...(hasUsage ? { sessionCredits: creditsFromUsageAmount(usageTotal) } : {}),
      };
    },

    async cancel(): Promise<{ enforced: boolean }> {
      // The agent tasks API exposes create, list and get — there is no cancel endpoint,
      // and stopping a session is a UI action. So cancellation is cooperative: the job is
      // marked canceled, the build channel's existing `control.stop` tells a live agent to
      // exit, and anything that still arrives is discarded because the job is terminal.
      // Reported honestly so callers never promise a creator more than we can do.
      return { enforced: false };
    },
  };
}

import {
  createAgentTasksClient,
  creditsFromUsageAmount,
  resolveTaskBranch,
  type AgentTask,
  type AgentTasksClient,
  type AgentTaskModel,
} from './agent-tasks.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { IN_FLIGHT_RUN_STATUSES } from '../platform/github-run-status.js';
import {
  ManagedAgentError,
  normalizeManagedState,
  registerManagedProvider,
  type ManagedAgentProvider,
  type ManagedProviderConfig,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';

export const COPILOT_VENDOR = 'copilot';

const DEFAULT_BASE_REF = 'main';
const DEFAULT_CUSTOM_AGENT = 'game-builder-mcp';

// A Copilot session is an Actions run under this synthetic workflow path.
export const COPILOT_AGENT_WORKFLOW_PATH = 'dynamic/copilot-swe-agent/copilot';

export type CopilotGitHubClient = Pick<GitHubClient, 'deleteBranch' | 'listWorkflowRuns' | 'cancelWorkflowRun'>;

// N1: catalog owns the client; the composition root builds it.
export type CopilotGitHubClientFactory = (input: { token: string; repo: string }) => CopilotGitHubClient;

export interface CopilotManagedProviderDeps {
  tasks?: AgentTasksClient;
  github?: CopilotGitHubClient;
}

function taskSession(task: AgentTask, model: string): ManagedSession {
  const usageTotal = task.sessions.reduce((sum, session) => (session.usage ? sum + session.usage.amount : sum), 0);
  const hasUsage = task.sessions.some((session) => session.usage);
  const sessionModel = task.sessions[task.sessions.length - 1]?.model ?? model;
  return {
    id: task.id,
    state: normalizeManagedState(task.state),
    vendorState: task.state,
    ...(resolveTaskBranch(task) ? { workspace: resolveTaskBranch(task)! } : {}),
    ...(hasUsage
      ? {
          usage: {
            unit: 'credits' as const,
            vendor: COPILOT_VENDOR,
            credits: creditsFromUsageAmount(usageTotal),
            model: sessionModel,
          },
        }
      : {}),
    ...(task.createdAt ? { startedAt: task.createdAt } : {}),
    ...(task.updatedAt ? { endedAt: task.updatedAt } : {}),
  };
}

export function createCopilotManagedProvider(
  config: ManagedProviderConfig,
  deps: CopilotManagedProviderDeps = {},
): ManagedAgentProvider {
  const repo = config.mcpRepo?.trim();
  if (!repo) throw new ManagedAgentError('copilot managed provider requires MANAGED_AGENT_COPILOT_MCP_REPO');
  const baseRef = config.mcpBaseRef?.trim() || DEFAULT_BASE_REF;
  const customAgent = config.mcpCustomAgent?.trim() || DEFAULT_CUSTOM_AGENT;
  const tasks =
    deps.tasks ??
    createAgentTasksClient({
      token: config.apiKey,
      repo,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    });
  const github = deps.github ?? config.githubClientFactory?.({ token: config.apiKey, repo });
  if (!github) throw new ManagedAgentError('copilot managed provider requires a GitHub client factory');

  return {
    vendor: COPILOT_VENDOR,
    model: config.model,
    supportsSeedFiles: false,

    async startSession(request: ManagedSessionRequest): Promise<ManagedSession> {
      if (!request.tools?.mcpEndpoints?.length) {
        throw new ManagedAgentError('copilot managed provider requires an MCP endpoint');
      }
      const task = await tasks.startTask({
        prompt: request.prompt,
        baseRef,
        model: request.model as AgentTaskModel,
        createPullRequest: false,
        customAgent,
      });
      return taskSession(task, request.model);
    },

    async getSession(sessionId: string): Promise<ManagedSession | null> {
      const task = await tasks.getTask(sessionId);
      return task ? taskSession(task, config.model) : null;
    },

    // No stop endpoint in agent tasks — cancel the Actions run instead.
    async cancelSession(sessionId: string): Promise<{ enforced: boolean }> {
      const branch = await tasks
        .getTask(sessionId)
        .then((task) => (task ? resolveTaskBranch(task) : null))
        .catch(() => null);
      // No branch yet means no run to stop; the next poll retries.
      if (!branch) return { enforced: false };

      const runs = await github.listWorkflowRuns({ branch }).catch(() => []);
      // Validation CI shares the branch, so match the agent workflow path.
      const inFlight = runs.filter(
        (run) => run.path === COPILOT_AGENT_WORKFLOW_PATH && IN_FLIGHT_RUN_STATUSES.includes(run.status),
      );

      // One left running is one still spending, so every match must cancel.
      let allCancelled = true;
      for (const run of inFlight) {
        // Best effort: a token without `actions: write` reports unenforced.
        const cancelled = await github
          .cancelWorkflowRun(run.id)
          .then(() => true)
          .catch(() => false);
        allCancelled = allCancelled && cancelled;
      }
      return { enforced: inFlight.length > 0 && allCancelled };
    },

    async deleteWorkspace(workspace: string): Promise<void> {
      await github.deleteBranch(workspace);
    },

    async deleteSession(): Promise<void> {},
    async releaseCredential(): Promise<void> {},
  };
}

registerManagedProvider(COPILOT_VENDOR, (config) => createCopilotManagedProvider(config));

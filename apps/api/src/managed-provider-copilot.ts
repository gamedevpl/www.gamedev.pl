import {
  createAgentTasksClient,
  creditsFromUsageAmount,
  resolveTaskBranch,
  stageAndCleanupSeedBranch,
  type AgentTask,
  type AgentTasksClient,
  type AgentTaskModel,
} from './agent-tasks.js';
import { createGitHubClient, type GitHubClient } from './github-client.js';
import {
  ManagedAgentError,
  normalizeManagedState,
  registerManagedProvider,
  type ManagedAgentProvider,
  type ManagedOutputRef,
  type ManagedProviderConfig,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';

export const COPILOT_VENDOR = 'copilot';

const DEFAULT_BASE_REF = 'main';
const DEFAULT_CUSTOM_AGENT = 'game-builder';

export interface CopilotManagedProviderDeps {
  tasks?: AgentTasksClient;
  github?: Pick<GitHubClient, 'deleteBranch' | 'createBranchWithFiles'>;
  // MCP-lane rounds; GitHub scopes Agent Tasks per repo, not per call.
  mcpTasks?: AgentTasksClient;
}

function seedSlug(files: ManagedSessionRequest['workspaceFiles']): string | undefined {
  const path = files?.[0]?.path ?? '';
  const match = /^games\/([^/]+)\//.exec(path);
  return match?.[1];
}

function withoutSeedPrompt(prompt: string): string {
  const withoutIntro = prompt.replace(
    /^(Build a new browser game in `games\/[^`]+\/`). \*\*A first draft of it is already in your checkout\*\* — see below\.$/m,
    '$1.',
  );
  return withoutIntro.replace(
    /\n## The draft you are starting from\n[\s\S]*?\n## Scope — this is enforced, not advisory\n/,
    '\n## Scope — this is enforced, not advisory\n',
  );
}

async function stageSeed(
  request: ManagedSessionRequest,
  baseRef: string,
  github: Pick<GitHubClient, 'deleteBranch' | 'createBranchWithFiles'>,
): Promise<string | null> {
  const files = request.workspaceFiles;
  const slug = seedSlug(files);
  if (!files?.length || !slug) return null;
  return stageAndCleanupSeedBranch({ github, issueNumber: request.correlationId, baseRef, slug, files });
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
  const repo = config.repo?.trim();
  if (!repo) throw new ManagedAgentError('copilot managed provider requires a games repo');
  const baseRef = config.baseRef?.trim() || DEFAULT_BASE_REF;
  const customAgent = config.customAgent?.trim() || DEFAULT_CUSTOM_AGENT;
  const createPullRequest = config.createPullRequest ?? false;
  const tasks =
    deps.tasks ??
    createAgentTasksClient({
      token: config.apiKey,
      repo,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    });
  const github = deps.github ?? createGitHubClient({ token: config.apiKey, repo });

  const mcpRepo = config.mcpRepo?.trim();
  const mcpBaseRef = config.mcpBaseRef?.trim() || DEFAULT_BASE_REF;
  const mcpCustomAgent = config.mcpCustomAgent?.trim() || 'game-builder-mcp';
  const mcpTasks =
    deps.mcpTasks ??
    (mcpRepo
      ? createAgentTasksClient({
          token: config.apiKey,
          repo: mcpRepo,
          ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
          ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
        })
      : undefined);
  const mcpGithub = mcpRepo ? createGitHubClient({ token: config.apiKey, repo: mcpRepo }) : undefined;
  // In-process session-repo tracking, same lifetime as credentialRef bookkeeping.
  const mcpSessionIds = new Set<string>();
  const mcpWorkspaces = new Set<string>();

  return {
    vendor: COPILOT_VENDOR,
    model: config.model,
    promptLane: 'harness',

    async startSession(request: ManagedSessionRequest): Promise<ManagedSession> {
      const promptLane = request.promptLane ?? 'harness';
      if (promptLane !== 'mcp' && request.tools?.mcpEndpoints?.length) {
        throw new ManagedAgentError('copilot managed provider uses the harness prompt lane, not MCP');
      }
      if (promptLane === 'mcp' && mcpTasks) {
        const task = await mcpTasks.startTask({
          prompt: withoutSeedPrompt(request.prompt),
          baseRef: mcpBaseRef,
          model: request.model as AgentTaskModel,
          createPullRequest: false,
          customAgent: mcpCustomAgent,
        });
        mcpSessionIds.add(task.id);
        return taskSession(task, request.model);
      }
      const seedBranch = promptLane === 'mcp' ? null : await stageSeed(request, baseRef, github);
      const task = await tasks.startTask({
        prompt: seedBranch ? request.prompt : withoutSeedPrompt(request.prompt),
        baseRef: seedBranch ?? baseRef,
        model: request.model as AgentTaskModel,
        createPullRequest,
        customAgent,
      });
      return { ...taskSession(task, request.model), ...(seedBranch ? { seedWorkspace: seedBranch } : {}) };
    },

    async getSession(sessionId: string): Promise<ManagedSession | null> {
      if (mcpTasks && mcpSessionIds.has(sessionId)) {
        const task = await mcpTasks.getTask(sessionId);
        const session = task ? taskSession(task, config.model) : null;
        if (session?.workspace) mcpWorkspaces.add(session.workspace);
        return session;
      }
      const task = await tasks.getTask(sessionId);
      return task ? taskSession(task, config.model) : null;
    },

    async listOutputs(): Promise<ManagedOutputRef[]> {
      return [];
    },

    async readOutput(_sessionId: string, ref: ManagedOutputRef): Promise<string> {
      throw new ManagedAgentError(`copilot does not expose session output ${ref.path}`);
    },

    async cancelSession(): Promise<{ enforced: boolean }> {
      return { enforced: false };
    },

    async deleteWorkspace(workspace: string): Promise<void> {
      if (mcpGithub && mcpWorkspaces.has(workspace)) {
        await mcpGithub.deleteBranch(workspace);
        return;
      }
      await github.deleteBranch(workspace);
    },

    async deleteSession(): Promise<void> {},
    async releaseCredential(): Promise<void> {},
  };
}

registerManagedProvider(COPILOT_VENDOR, (config) => createCopilotManagedProvider(config));

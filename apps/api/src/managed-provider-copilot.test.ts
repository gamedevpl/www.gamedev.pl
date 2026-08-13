import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { AgentTask, AgentTaskInput, AgentTasksClient } from './agent-tasks.js';
import { buildPrompt } from './build-prompt.js';
import type { BuildBrief } from './agent-backend.js';
import {
  COPILOT_AGENT_WORKFLOW_PATH,
  createCopilotManagedProvider,
  type CopilotGitHubClient as CopilotGitHub,
} from './managed-provider-copilot.js';
import type { WorkflowRun } from './github-client.js';

const BRIEF: BuildBrief = {
  issueNumber: 42,
  slug: 'comet-courier',
  spec: 'Deliver parcels between comets.',
  channelToken: 'tok_abc',
  apiBaseUrl: 'https://www.gamedev.pl',
};

const apiKey = () => randomBytes(32).toString('hex');

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return { id: 'task-1', state: 'queued', sessionCount: 0, sessions: [], ...overrides };
}

function githubStub(overrides: Partial<CopilotGitHub> = {}): CopilotGitHub {
  return {
    deleteBranch: vi.fn(async () => undefined),
    createBranchWithFiles: vi.fn(),
    listWorkflowRuns: vi.fn(async () => []),
    cancelWorkflowRun: vi.fn(async () => undefined),
    ...overrides,
  } as CopilotGitHub;
}

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return { id: 1, path: COPILOT_AGENT_WORKFLOW_PATH, status: 'in_progress', ...overrides };
}

function tasks(result: AgentTask = task()) {
  const startTask = vi.fn(async (_input: AgentTaskInput) => result);
  const getTask = vi.fn(async () => result);
  return {
    client: { startTask, getTask, listTasks: vi.fn(async () => []) } as unknown as AgentTasksClient,
    startTask,
    getTask,
  };
}

describe('Copilot managed provider', () => {
  it('declares the harness lane and preserves the legacy task payload', async () => {
    const stub = tasks(task({ branch: { baseRef: 'main', headRef: 'copilot/courier' } }));
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub() },
    );

    await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF),
      model: 'gpt-5.4',
      outputPath: 'outputs',
    });

    expect(provider.promptLane).toBe('harness');
    expect(stub.startTask).toHaveBeenCalledWith({
      prompt: buildPrompt(BRIEF),
      baseRef: 'main',
      model: 'gpt-5.4',
      createPullRequest: false,
      customAgent: 'game-builder',
    });
  });

  it('accepts a per-round MCP lane without staging a harness seed branch', async () => {
    const stub = tasks();
    const createBranchWithFiles = vi.fn(async () => undefined);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub({ createBranchWithFiles }) },
    );

    await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF, { kind: 'channel', fast: true }),
      model: 'gpt-5.4',
      outputPath: 'outputs',
      promptLane: 'mcp',
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
      workspaceFiles: [{ path: 'games/comet-courier/game.ts', content: 'x' }],
    });

    expect(createBranchWithFiles).not.toHaveBeenCalled();
    expect(stub.startTask.mock.calls[0]?.[0].prompt).toContain('"key": "tok_abc"');
  });

  it('declares seed files unsupported on the mcp lane, supported off it', () => {
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: tasks().client, github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() } },
    );

    expect(typeof provider.supportsSeedFiles).toBe('function');
    const supportsSeedFiles = provider.supportsSeedFiles as (lane: 'mcp' | 'harness' | 'outputs') => boolean;
    expect(supportsSeedFiles('mcp')).toBe(false);
    expect(supportsSeedFiles('harness')).toBe(true);
    expect(supportsSeedFiles('outputs')).toBe(true);
  });

  it('stages a seed on the same disposable branch as legacy Copilot', async () => {
    const stub = tasks();
    const github = { deleteBranch: vi.fn(async () => undefined), createBranchWithFiles: vi.fn(async () => undefined) };
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github },
    );

    const session = await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt({
        ...BRIEF,
        seed: { slug: 'comet-courier', files: [{ path: 'game.ts', content: 'x' }], references: [] },
      }),
      model: 'gpt-5.4',
      outputPath: 'outputs',
      workspaceFiles: [{ path: 'games/comet-courier/game.ts', content: 'x' }],
    });

    expect(github.deleteBranch).toHaveBeenCalledWith('seed/job-42');
    expect(github.createBranchWithFiles).toHaveBeenCalledWith({
      branch: 'seed/job-42',
      baseRef: 'main',
      message: 'Seed round 0 for comet-courier (job 42)',
      files: [{ path: 'games/comet-courier/game.ts', content: 'x' }],
    });
    expect(stub.startTask.mock.calls[0]?.[0].baseRef).toBe('seed/job-42');
    expect(session.workspace).toBeUndefined();
    expect(session.seedWorkspace).toBe('seed/job-42');
  });

  it('fails open to an unseeded prompt when the seed branch cannot be written', async () => {
    const stub = tasks();
    const github = {
      deleteBranch: vi.fn(async () => undefined),
      createBranchWithFiles: vi.fn(async () => {
        throw new Error('branch unavailable');
      }),
    };
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github },
    );
    const prompt = buildPrompt({
      ...BRIEF,
      seed: { slug: 'comet-courier', files: [{ path: 'game.ts', content: 'x' }], references: [] },
    });

    await provider.startSession({
      correlationId: '42',
      prompt,
      model: 'gpt-5.4',
      outputPath: 'outputs',
      workspaceFiles: [{ path: 'games/comet-courier/game.ts', content: 'x' }],
    });

    expect(stub.startTask.mock.calls[0]?.[0].baseRef).toBe('main');
    expect(stub.startTask.mock.calls[0]?.[0].prompt).not.toContain('already contains a generated first draft');
  });

  it('sums every Copilot session into credits without inventing tokens', async () => {
    const stub = tasks(
      task({
        state: 'completed',
        sessions: [
          { id: 's1', state: 'completed', usage: { amount: 1_250_000_000, type: 'ai_credits' } },
          { id: 's2', state: 'completed', usage: { amount: 2_200_000_000, type: 'ai_credits' } },
        ],
      }),
    );
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub() },
    );

    const session = await provider.getSession('task-1');

    expect(session).toMatchObject({
      state: 'completed',
      usage: { unit: 'credits', vendor: 'copilot', credits: 3.45, model: 'gpt-5.4' },
    });
    expect(session?.usage?.unit).toBe('credits');
  });

  it('maps the task branch into the managed workspace field', async () => {
    const stub = tasks(task({ state: 'in_progress', branch: { headRef: 'copilot/tv-tycoon' } }));
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub() },
    );

    await expect(provider.getSession('task-1')).resolves.toMatchObject({
      state: 'in_progress',
      workspace: 'copilot/tv-tycoon',
    });
  });

  it('does not expose outputs or a message channel', async () => {
    const stub = tasks();
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub() },
    );

    expect(await provider.listOutputs('task-1')).toEqual([]);
    expect(provider.sendMessage).toBeUndefined();
    await expect(provider.readOutput('task-1', { path: 'game.ts' })).rejects.toThrow(/does not expose session output/);
    // No branch yet, so nothing to stop.
    expect(await provider.cancelSession('task-1')).toEqual({ enforced: false });
    await expect(provider.deleteSession?.('task-1')).resolves.toBeUndefined();
    await expect(provider.releaseCredential?.(apiKey())).resolves.toBeUndefined();
  });

  it('interrupts a task by cancelling the agent run on its branch', async () => {
    const stub = tasks(task({ state: 'in_progress', branch: { headRef: 'copilot/tv-tycoon' } }));
    const cancelWorkflowRun = vi.fn(async () => undefined);
    const listWorkflowRuns = vi.fn(async () => [
      // CI on the same branch and a finished run are not it.
      run({ id: 10, path: '.github/workflows/validate.yml' }),
      run({ id: 11, status: 'completed' }),
      run({ id: 12, status: 'queued' }),
      run({ id: 13, status: 'in_progress' }),
    ]);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub({ listWorkflowRuns, cancelWorkflowRun }) },
    );

    await expect(provider.cancelSession('task-1')).resolves.toEqual({ enforced: true });

    expect(listWorkflowRuns).toHaveBeenCalledWith({ branch: 'copilot/tv-tycoon' });
    expect(cancelWorkflowRun.mock.calls.map(([id]) => id)).toEqual([12, 13]);
  });

  it('reports an unenforced cancel rather than throwing when GitHub refuses', async () => {
    const stub = tasks(task({ state: 'in_progress', branch: { headRef: 'copilot/tv-tycoon' } }));
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      {
        tasks: stub.client,
        github: githubStub({
          listWorkflowRuns: vi.fn(async () => [run({ id: 12 })]),
          // What a token without `actions: write` looks like.
          cancelWorkflowRun: vi.fn(async () => {
            throw new Error('github request failed: 403');
          }),
        }),
      },
    );

    await expect(provider.cancelSession('task-1')).resolves.toEqual({ enforced: false });
  });

  it('deletes the disposable workspace branch during backend cleanup', async () => {
    const stub = tasks();
    const deleteBranch = vi.fn(async () => undefined);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: githubStub({ deleteBranch }) },
    );

    await provider.deleteWorkspace?.('copilot/spent');

    expect(deleteBranch).toHaveBeenCalledWith('copilot/spent');
  });

  it('routes an MCP-lane round to the configured mcpRepo, not the games repo', async () => {
    const stub = tasks();
    const mcpStub = tasks(task({ id: 'mcp-task-1' }));
    const provider = createCopilotManagedProvider(
      {
        apiKey: apiKey(),
        model: 'gpt-5.4',
        repo: 'gamedevpl/www.gamedev.pl-games',
        mcpRepo: 'gamedevpl/scratchpad',
        mcpCustomAgent: 'game-builder-mcp',
      },
      {
        tasks: stub.client,
        github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() },
        mcpTasks: mcpStub.client,
      },
    );

    const session = await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF, { kind: 'channel', fast: true }),
      model: 'gpt-5.4',
      outputPath: 'outputs',
      promptLane: 'mcp',
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
    });

    expect(stub.startTask).not.toHaveBeenCalled();
    expect(mcpStub.startTask).toHaveBeenCalledWith({
      prompt: buildPrompt(BRIEF, { kind: 'channel', fast: true }),
      baseRef: 'main',
      model: 'gpt-5.4',
      createPullRequest: false,
      customAgent: 'game-builder-mcp',
    });
    expect(session.id).toBe('mcp-task-1');

    // Later polls for that session must hit mcpTasks, not the games repo.
    await provider.getSession('mcp-task-1');
    expect(mcpStub.getTask).toHaveBeenCalledWith('mcp-task-1');
    expect(stub.getTask).not.toHaveBeenCalled();
  });

  it('keeps the harness lane on the games repo when mcpRepo is configured but unused', async () => {
    const stub = tasks();
    const mcpStub = tasks();
    const provider = createCopilotManagedProvider(
      {
        apiKey: apiKey(),
        model: 'gpt-5.4',
        repo: 'gamedevpl/www.gamedev.pl-games',
        mcpRepo: 'gamedevpl/scratchpad',
      },
      {
        tasks: stub.client,
        github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() },
        mcpTasks: mcpStub.client,
      },
    );

    await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF),
      model: 'gpt-5.4',
      outputPath: 'outputs',
    });

    expect(stub.startTask).toHaveBeenCalled();
    expect(mcpStub.startTask).not.toHaveBeenCalled();
  });

  it('falls back to mcpTasks when polling an untracked session id after a provider restart', async () => {
    const stub = tasks(task({ id: 'harness-task-1' }));
    stub.getTask.mockImplementation(async (id: string) => (id === 'harness-task-1' ? task({ id }) : null));
    const mcpStub = tasks(
      task({
        id: 'mcp-task-restart',
        branch: { headRef: 'copilot/mcp-round-branch' },
      }),
    );
    mcpStub.getTask.mockImplementation(async (id: string) =>
      id === 'mcp-task-restart' ? task({ id, branch: { headRef: 'copilot/mcp-round-branch' } }) : null,
    );

    // Fresh provider instance with empty in-memory mcpSessionIds and mcpWorkspaces
    const provider = createCopilotManagedProvider(
      {
        apiKey: apiKey(),
        model: 'gpt-5.4',
        repo: 'gamedevpl/www.gamedev.pl-games',
        mcpRepo: 'gamedevpl/scratchpad',
      },
      {
        tasks: stub.client,
        github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() },
        mcpTasks: mcpStub.client,
      },
    );

    const session = await provider.getSession('mcp-task-restart');
    expect(stub.getTask).toHaveBeenCalledWith('mcp-task-restart');
    expect(mcpStub.getTask).toHaveBeenCalledWith('mcp-task-restart');
    expect(session).toMatchObject({
      id: 'mcp-task-restart',
      workspace: 'copilot/mcp-round-branch',
    });

    // Cached routing now hits mcpTasks directly without games repo fallback.
    stub.getTask.mockClear();
    mcpStub.getTask.mockClear();
    await provider.getSession('mcp-task-restart');
    expect(mcpStub.getTask).toHaveBeenCalledWith('mcp-task-restart');
    expect(stub.getTask).not.toHaveBeenCalled();
  });
});

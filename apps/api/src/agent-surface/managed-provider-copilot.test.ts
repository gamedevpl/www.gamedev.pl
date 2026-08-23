import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { AgentTask, AgentTaskInput, AgentTasksClient } from '../creation/agent-tasks.js';
import { buildPrompt } from '../delivery/build-prompt.js';
import type { BuildBrief } from './agent-backend.js';
import {
  COPILOT_AGENT_WORKFLOW_PATH,
  createCopilotManagedProvider,
  type CopilotGitHubClient as CopilotGitHub,
} from './managed-provider-copilot.js';
import type { WorkflowRun } from '../catalog/github-client.js';

const BRIEF: BuildBrief = {
  issueNumber: 42,
  slug: 'comet-courier',
  spec: 'Deliver parcels between comets.',
  channelToken: 'tok_abc',
  apiBaseUrl: 'https://www.gamedev.pl',
};

const MCP_ENDPOINTS = { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] };

const apiKey = () => randomBytes(32).toString('hex');

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return { id: 'task-1', state: 'queued', sessionCount: 0, sessions: [], ...overrides };
}

function githubStub(overrides: Partial<CopilotGitHub> = {}): CopilotGitHub {
  return {
    deleteBranch: vi.fn(async () => undefined),
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
  it('requires the scratch repo to construct at all', () => {
    expect(() => createCopilotManagedProvider({ apiKey: apiKey(), model: 'gpt-5.4' })).toThrow(
      /MANAGED_AGENT_COPILOT_MCP_REPO/,
    );
  });

  it('dispatches into the configured scratch repo with the mcp custom agent', async () => {
    const stub = tasks(task({ branch: { baseRef: 'main', headRef: 'copilot/courier' } }));
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub() },
    );

    await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF),
      model: 'gpt-5.4',
      tools: MCP_ENDPOINTS,
    });

    expect(stub.startTask).toHaveBeenCalledWith({
      prompt: buildPrompt(BRIEF),
      baseRef: 'main',
      model: 'gpt-5.4',
      createPullRequest: false,
      customAgent: 'game-builder-mcp',
    });
  });

  it('refuses a round with no MCP endpoint', async () => {
    const stub = tasks();
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub() },
    );

    await expect(
      provider.startSession({ correlationId: '42', prompt: buildPrompt(BRIEF), model: 'gpt-5.4' }),
    ).rejects.toThrow(/requires an MCP endpoint/);
    expect(stub.startTask).not.toHaveBeenCalled();
  });

  it('honors a configured base ref and custom agent', async () => {
    const stub = tasks();
    const provider = createCopilotManagedProvider(
      {
        apiKey: apiKey(),
        model: 'gpt-5.4',
        mcpRepo: 'gamedevpl/scratchpad',
        mcpBaseRef: 'develop',
        mcpCustomAgent: 'custom-agent',
      },
      { tasks: stub.client, github: githubStub() },
    );

    await provider.startSession({
      correlationId: '42',
      prompt: buildPrompt(BRIEF),
      model: 'gpt-5.4',
      tools: MCP_ENDPOINTS,
    });

    expect(stub.startTask).toHaveBeenCalledWith(
      expect.objectContaining({ baseRef: 'develop', customAgent: 'custom-agent' }),
    );
  });

  it('never supports seed files — this lane has no shell to place them with', () => {
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: tasks().client, github: githubStub() },
    );

    expect(provider.supportsSeedFiles).toBe(false);
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
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
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
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub() },
    );

    await expect(provider.getSession('task-1')).resolves.toMatchObject({
      state: 'in_progress',
      workspace: 'copilot/tv-tycoon',
    });
  });

  it('answers null for a session the vendor has forgotten, and has no message channel', async () => {
    const stub = tasks();
    stub.getTask.mockResolvedValue(null as unknown as AgentTask);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub() },
    );

    expect(await provider.getSession('task-1')).toBeNull();
    expect(provider.sendMessage).toBeUndefined();
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
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub({ listWorkflowRuns, cancelWorkflowRun }) },
    );

    await expect(provider.cancelSession('task-1')).resolves.toEqual({ enforced: true });

    expect(listWorkflowRuns).toHaveBeenCalledWith({ branch: 'copilot/tv-tycoon' });
    expect(cancelWorkflowRun.mock.calls.map(([id]) => id)).toEqual([12, 13]);
  });

  it('reports an unenforced cancel rather than throwing when GitHub refuses', async () => {
    const stub = tasks(task({ state: 'in_progress', branch: { headRef: 'copilot/tv-tycoon' } }));
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
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

  it('reports unenforced when only some of several in-flight runs cancel', async () => {
    const stub = tasks(task({ state: 'in_progress', branch: { headRef: 'copilot/tv-tycoon' } }));
    // A resumed round can leave two runs in flight.
    const cancelWorkflowRun = vi.fn(async (runId: number) => {
      if (runId === 13) throw new Error('github request failed: 403');
    });
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      {
        tasks: stub.client,
        github: githubStub({
          listWorkflowRuns: vi.fn(async () => [run({ id: 12 }), run({ id: 13 })]),
          cancelWorkflowRun,
        }),
      },
    );

    // A partial stop must not read as fully enforced.
    await expect(provider.cancelSession('task-1')).resolves.toEqual({ enforced: false });
    expect(cancelWorkflowRun.mock.calls.map(([id]) => id)).toEqual([12, 13]);
  });

  it('deletes the disposable workspace branch during backend cleanup', async () => {
    const stub = tasks();
    const deleteBranch = vi.fn(async () => undefined);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', mcpRepo: 'gamedevpl/scratchpad' },
      { tasks: stub.client, github: githubStub({ deleteBranch }) },
    );

    await provider.deleteWorkspace?.('copilot/spent');

    expect(deleteBranch).toHaveBeenCalledWith('copilot/spent');
  });
});

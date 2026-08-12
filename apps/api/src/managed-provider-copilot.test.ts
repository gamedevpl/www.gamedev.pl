import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { AgentTask, AgentTaskInput, AgentTasksClient } from './agent-tasks.js';
import { buildPrompt } from './build-prompt.js';
import type { BuildBrief } from './agent-backend.js';
import { createCopilotManagedProvider } from './managed-provider-copilot.js';

const BRIEF: BuildBrief = {
  issueNumber: 42,
  slug: 'comet-courier',
  spec: 'Deliver parcels between comets.',
  channelToken: 'tok_abc',
  mcpOpenerToken: 'opener_xyz',
  apiBaseUrl: 'https://www.gamedev.pl',
};

const apiKey = () => randomBytes(32).toString('hex');

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return { id: 'task-1', state: 'queued', sessionCount: 0, sessions: [], ...overrides };
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
      { tasks: stub.client, github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() } },
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
      { tasks: stub.client, github: { deleteBranch: vi.fn(), createBranchWithFiles } },
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
    // The connector lane's start() call must carry the round-scoped opener, not the
    // harness channelToken — the connector's bearer is deliberately generic (one shared
    // GitHub secret for every Copilot round), so this key argument is the ONLY thing
    // that scopes the call to one round. The old value made every connector-lane round
    // fail its very first tool call in production.
    expect(stub.startTask.mock.calls[0]?.[0].prompt).toContain('"key": "opener_xyz"');
    expect(stub.startTask.mock.calls[0]?.[0].prompt).not.toContain('"key": "tok_abc"');
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
      { tasks: stub.client, github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() } },
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
      { tasks: stub.client, github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() } },
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
      { tasks: stub.client, github: { deleteBranch: vi.fn(), createBranchWithFiles: vi.fn() } },
    );

    expect(await provider.listOutputs('task-1')).toEqual([]);
    expect(provider.sendMessage).toBeUndefined();
    await expect(provider.readOutput('task-1', { path: 'game.ts' })).rejects.toThrow(/does not expose session output/);
    expect(await provider.cancelSession('task-1')).toEqual({ enforced: false });
    await expect(provider.deleteSession?.('task-1')).resolves.toBeUndefined();
    await expect(provider.releaseCredential?.(apiKey())).resolves.toBeUndefined();
  });

  it('deletes the disposable workspace branch during backend cleanup', async () => {
    const stub = tasks();
    const deleteBranch = vi.fn(async () => undefined);
    const provider = createCopilotManagedProvider(
      { apiKey: apiKey(), model: 'gpt-5.4', repo: 'gamedevpl/www.gamedev.pl-games' },
      { tasks: stub.client, github: { deleteBranch, createBranchWithFiles: vi.fn() } },
    );

    await provider.deleteWorkspace?.('copilot/spent');

    expect(deleteBranch).toHaveBeenCalledWith('copilot/spent');
  });
});

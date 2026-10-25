import { AsyncResource } from 'node:async_hooks';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentResult, AgentTask, CodingAgent } from 'genaicode/agents';
import type { AdapterSpec } from './adapters.js';
import type { ApiClient } from './api.js';
import { saveAgentSelection } from './agent-settings.js';
import { writeGameFiles } from './checkout.js';
import { brainAgent, decideApproval, startPlayBrain, type PlayBrain } from './play-brain.js';
import type { Workshop } from './workshop.js';

// Setup waits until it is cancelled; only a local (non-runAdapter) workshop reaches it.
vi.mock('./prepare-workspace.js', () => ({
  prepareWorkspace: (input: { abort: AbortSignal }) =>
    new Promise((_, reject) =>
      input.abort.addEventListener('abort', () => reject(new Error('setup cancelled')), { once: true }),
    ),
}));

type Step = (task: AgentTask) => Promise<string>;

function fakeAgent(steps: Step[]): { agent: CodingAgent; tasks: AgentTask[] } {
  const tasks: AgentTask[] = [];
  const agent: CodingAgent = {
    name: 'claude',
    command: process.execPath,
    capabilities: { resume: true, mcp: true, approvals: true },
    run(task) {
      tasks.push(task);
      const step = steps.shift() ?? (async () => 'nothing to do');
      const done = step(task).then((text) => {
        const result: AgentResult = { status: 'completed', ok: true, exitCode: 0, signal: null, sessionId: 's1' };
        return { text, result };
      });
      return {
        result: done.then(({ result }) => result),
        abort() {},
        async *[Symbol.asyncIterator]() {
          const { text, result } = await done;
          const events: AgentEvent[] = [
            { type: 'session', sessionId: 's1' },
            { type: 'message', text },
            { type: 'done', result },
          ];
          yield* events;
        },
      };
    },
  };
  return { agent, tasks };
}

async function callTool(task: AgentTask, name: string, args: Record<string, unknown> = {}) {
  const server = task.mcpServers![0] as { url: string; headers?: Record<string, string> };
  const response = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...server.headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const reply = (await response.json()) as { result: { content: Array<{ text: string }> } };
  return reply.result.content[0]!.text;
}

const roots: string[] = [];
const brains: PlayBrain[] = [];
afterEach(async () => {
  for (const brain of brains.splice(0)) await brain.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(steps: Step[], answers: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'play-brain-'));
  roots.push(root);
  writeGameFiles(root, 'snake', [{ path: 'game.ts', content: 'export const speed = 1;\n' }]);
  writeFileSync(join(root, '.gamedev-slug'), 'snake');
  const lines: string[] = [];
  const prompts: Array<{ choices: string[]; question: string }> = [];
  const picks: string[] = [];
  let red = 0;
  const ready = { value: true };
  const api: ApiClient = {
    origin: 'https://gamedev.test',
    request: async <T>(_method: string, path: string) => {
      if (path.endsWith('/sources/session')) return { locked: false, canTakeOver: false, jobId: 1, generation: 1 } as T;
      throw new Error(`unexpected ${path}`);
    },
    requestBytes: async () => Buffer.alloc(0),
  };
  const fake = fakeAgent(steps);
  const ws: Workshop = {
    slug: 'snake',
    root,
    token: 'tok',
    env: { XDG_CONFIG_HOME: root },
    adapters: [{ name: 'claude', command: 'claude' } as AdapterSpec],
    builder: 'self',
    pick: async (choices, question) => {
      picks.push(question);
      return choices.at(-1)!;
    },
    abort: { current: null },
    runAdapter: async () => ({ code: 0 }),
    run: () => (red-- > 0 ? { status: 1, stderr: 'game.ts(1,1): error TS1005' } : { status: 0, stderr: '' }),
  };
  const start = async (failing = 0, prompt?: Parameters<typeof startPlayBrain>[0]['prompt']) => {
    red = failing;
    const brain = await startPlayBrain({
      api,
      ws,
      prompt:
        prompt ??
        (async (choices, question) => {
          prompts.push({ choices, question });
          return answers.shift() ?? choices.at(-1)!;
        }),
      write: (line) => lines.push(line),
      activity: () => {},
      agents: () => [fake.agent],
      ready: async () => ready.value,
    });
    brains.push(brain!);
    return brain!;
  };
  const edit = (content: string) => writeGameFiles(root, 'snake', [{ path: 'game.ts', content }]);
  return { start, lines, prompts, picks, tasks: fake.tasks, edit, ws, ready };
}

describe('play brain', () => {
  it('runs only agents that take per-run MCP tools, preferring the selected one', () => {
    const spec = (name: string) => ({ name, command: name }) as AdapterSpec;
    expect(brainAgent({ adapters: [spec('muse'), spec('codex'), spec('claude')], selectedAgent: 'claude' })).toBe(
      'claude',
    );
    expect(brainAgent({ adapters: [spec('muse'), spec('codex')], selectedAgent: 'muse' })).toBe('codex');
    expect(brainAgent({ adapters: [spec('muse'), spec('gemini')] })).toBeUndefined();
  });

  it('maps Ask, Auto-approve and YOLO onto the agent CLI prompts', () => {
    expect(decideApproval('ask', { id: '1', kind: 'file-change' })).toBeUndefined();
    expect(decideApproval('auto', { id: '1', kind: 'file-change' })).toBe('approve');
    expect(decideApproval('auto', { id: '1', kind: 'command', summary: 'rm -rf /' })).toBeUndefined();
    expect(decideApproval('yolo', { id: '1', kind: 'command' })).toBe('approve');
  });

  it('answers a question without checks or a delivery offer', async () => {
    const t = setup([async () => 'The snake moves one cell per tick.']);
    const brain = await t.start();
    await brain.turn('how fast is the snake?');
    expect(t.tasks[0]!.prompt).toContain('You edit the gamedev.pl game "snake"');
    expect(t.tasks[0]!.prompt).toContain('how fast is the snake?');
    expect(t.lines).toContain('The snake moves one cell per tick.');
    expect(t.picks).toEqual([]);
  });

  it('sends red checks back to the agent, then offers the green edit for delivery', async () => {
    const t = setup([
      async () => {
        t.edit('export const speed = 2\n');
        return 'Faster now.';
      },
      async (task) => {
        expect(task.prompt).toContain('<validation stage="typecheck">');
        t.edit('export const speed = 2;\n');
        return 'Fixed the syntax.';
      },
    ]);
    const brain = await t.start(1);
    await brain.turn('make the snake faster');
    expect(t.tasks).toHaveLength(2);
    expect(t.lines).toContain('verify failed at typecheck');
    expect(t.lines).toContain('✓ static ladder green');
    expect(t.picks).toEqual(['Deliver snake?']);
  });

  it('stops after two repairs that stay red', async () => {
    const t = setup([
      async () => {
        t.edit('broken 1');
        return 'one';
      },
      async () => {
        t.edit('broken 2');
        return 'two';
      },
      async () => {
        t.edit('broken 3');
        return 'three';
      },
    ]);
    const brain = await t.start(5);
    await brain.turn('make the snake faster');
    expect(t.tasks).toHaveLength(3);
    expect(t.lines).toContainEqual(expect.stringMatching(/Checks still fail after 2 automatic repairs/));
    expect(t.picks).toEqual([]);
    // /retry (the workshop's) resumes the failed request from the original baseline.
    expect(t.ws.failedTask).toMatchObject({ request: 'make the snake faster', agent: 'claude' });
    expect(t.ws.failedTask!.before).toEqual([{ path: 'game.ts', content: 'export const speed = 1;\n' }]);
    expect(t.lines.at(-1)).toBe('Task saved locally — /retry resumes it with claude; /diff shows partial edits.');
    await brain.turn('what is the speed?');
    expect(t.ws.failedTask).toBeUndefined();
  });

  it('runs the agent with the model and effort saved by /model, read on every turn', async () => {
    const t = setup([async () => 'one', async () => 'two']);
    const brain = await t.start();
    await brain.turn('first');
    expect(t.tasks[0]!.model).toBeUndefined();
    saveAgentSelection('claude', { model: 'claude-test', effort: 'high' }, t.ws.env);
    await brain.turn('second');
    expect([t.tasks[1]!.model, t.tasks[1]!.effort]).toEqual(['claude-test', 'high']);
  });

  it('keeps a stale or conflicting checkout away from the agent, as the workshop does', async () => {
    const t = setup([async () => 'never']);
    const brain = await t.start();
    t.ready.value = false;
    await brain.turn('make the snake faster');
    expect(t.tasks).toEqual([]);
    t.ready.value = true;
    mkdirSync(join(t.ws.root, '.gamedev'), { recursive: true });
    writeFileSync(join(t.ws.root, '.gamedev', 'merge.json'), '{}');
    await expect(brain.turn('make the snake faster')).rejects.toThrow(/A merge is pending/);
    expect(t.tasks).toEqual([]);
  });

  it('runs a delivery approved outside the turn (the browser chat) inside its checkout lock', async () => {
    const t = setup([
      async (task) => await callTool(task, 'game_submit', { approval_summary: 'Deliver snake' }),
      async (task) => {
        // The fake platform refuses the upload; the lock let submit get that far.
        expect(task.prompt).toContain('Action #1 failed: unexpected /api/');
        expect(task.prompt).not.toContain('Another CLI operation owns this checkout');
        return 'Delivery failed.';
      },
    ]);
    const outside = new AsyncResource('browser');
    const started: { brain?: PlayBrain } = {};
    started.brain = await t.start(0, async () => {
      outside.runInAsyncScope(() => started.brain!.agent.decide('1', 'approve'));
      return 'Approve';
    });
    await started.brain.turn('deliver it');
    expect(t.lines).toContain('Delivery failed.');
  });

  it('asks the creator before a delivery the agent proposes, and tells the agent the answer', async () => {
    const t = setup(
      [
        async (task) => {
          t.edit('export const speed = 3;\n');
          return await callTool(task, 'game_publish', { approval_summary: 'Publish snake' });
        },
        async (task) => {
          expect(task.prompt).toContain('The user rejected action #1 (Publish snake).');
          return 'Not published.';
        },
      ],
      ['Reject'],
    );
    const brain = await t.start();
    await brain.turn('publish it');
    expect(t.prompts).toEqual([{ choices: ['Approve', 'Reject'], question: 'Publish snake' }]);
    expect(t.lines).toContain('Not published.');
    // The agent proposed a delivery itself: no second offer from the workshop.
    expect(t.picks).toEqual([]);
  });

  it('shows the full permission request before the creator allows it', async () => {
    const t = setup(
      [
        async (task) =>
          await task.onApproval!(
            { id: 'a1', kind: 'command', summary: 'tidy up', detail: { input: { command: 'rm -rf build' } } },
            new AbortController().signal,
          ),
        async (task) =>
          await task.onApproval!(
            { id: 'a2', kind: 'other', detail: { blob: 'x'.repeat(8000) } },
            new AbortController().signal,
          ),
      ],
      ['Allow'],
    );
    const brain = await t.start();
    await brain.turn('clean the build');
    expect(t.prompts[0]!.question).toContain('Command: rm -rf build');
    expect(t.prompts[0]!.question).toContain('Allow this invocation once?');
    expect(t.lines).toContain('approve');
    await brain.turn('again');
    expect(t.prompts).toHaveLength(1);
    expect(t.lines).toContain('claude: permission request is too large to display completely; denied.');
    expect(t.lines).toContain('deny');
  });

  it('lets Ctrl+C cancel the first setup, then frees the abort slot', async () => {
    const t = setup([]);
    t.ws.runAdapter = undefined;
    const starting = t.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(t.ws.abort.current).toBeTruthy();
    t.ws.abort.current!.abort();
    await expect(starting).rejects.toThrow('setup cancelled');
    expect(t.ws.abort.current).toBeNull();
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { chooseExecution, type PendingExecution } from './execution.js';
import { connectGame } from './connect.js';
import type { ApiClient } from './api.js';
import { saveAgentSelection } from './agent-settings.js';

vi.mock('./connect.js', () => ({ connectGame: vi.fn(async () => ({ spawned: true, mcp: true })) }));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

function environment(command = 'claude'): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-execution-'));
  roots.push(root);
  writeFileSync(
    join(root, command),
    `#!${process.execPath}
if (!process.argv.includes('--help')) process.exit(99);
console.log('-p --print --verbose --permission-mode --output-format --mode --sandbox');
`,
    { mode: 0o700 },
  );
  return { PATH: root, HOME: root };
}

describe('conversational builder selection', () => {
  it('keeps the platform selectable when local settings are corrupt', async () => {
    const env = environment();
    saveAgentSelection('claude', {}, env);
    writeFileSync(join(env.HOME!, '.config/gamedevpl/agent-settings.json'), '{broken');
    const choice = await chooseExecution({
      env,
      pick: async (choices) => {
        expect(choices[0]).toContain('unavailable');
        return choices.find((row) => row.startsWith('gamedev.pl builder'))!;
      },
    });
    expect(choice).toEqual({ builder: 'platform' });
  });
  it('chooses self before creating a new game and starts MCP afterwards', async () => {
    const order: string[] = [];
    const bodies: unknown[] = [];
    const api = {
      origin: 'https://example.test',
      request: async (_method: string, path: string, body: unknown) => {
        order.push(path);
        bodies.push(body);
        return path === '/api/cli/chat'
          ? { kind: 'proposal', title: 'Robots', concept: 'A garden of robots', conversationId: 'c' }
          : { token: 'tok', slug: 'robots' };
      },
    } as unknown as ApiClient;
    const result = await handleReplLine({
      api,
      token: null,
      line: 'build robots',
      env: environment(),
      pick: async (choices) => {
        order.push('pick');
        return choices[0]!;
      },
      write: () => undefined,
    });
    expect(order).toEqual(['/api/cli/chat', 'pick', '/api/submissions']);
    expect(bodies[0]).toMatchObject({ prepareOnly: true });
    expect(bodies[1]).toMatchObject({ builder: 'self' });
    expect(connectGame).toHaveBeenCalledWith(expect.objectContaining({ slug: 'robots', agent: 'claude' }));
    expect(result).toMatchObject({ token: 'tok', slug: 'robots' });
  });

  it('does not create a game after the selection is cancelled', async () => {
    const request = vi.fn(async () => ({
      kind: 'proposal',
      title: 'Robots',
      concept: 'A garden of robots',
      conversationId: 'c',
    }));
    await handleReplLine({
      api: { request } as unknown as ApiClient,
      token: null,
      line: 'build robots',
      env: environment(),
      pick: async () => '/quit',
      write: () => undefined,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(connectGame).not.toHaveBeenCalled();
  });

  it('does not deliver a revision or hand off when its selection is cancelled', async () => {
    const request = vi.fn(async (_method: string, _path: string, _body?: unknown) => ({
      kind: 'proposal',
      ack: 'On it',
    }));
    await handleReplLine({
      api: { request } as unknown as ApiClient,
      token: 'tok',
      line: 'make robots blue',
      env: environment(),
      pick: async () => '/quit',
      write: () => undefined,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[2]).toMatchObject({ prepareOnly: true });
    expect(connectGame).not.toHaveBeenCalled();
  });

  it('offers a checkout for a tool without session-scoped MCP configuration', async () => {
    const picked = await chooseExecution({
      env: environment('agy'),
      pick: async (choices) => {
        expect(choices[0]).toContain('download a checkout');
        return choices[0]!;
      },
    });
    expect(picked).toMatchObject({ builder: 'self', spec: { name: 'agy' }, mode: 'local' });
  });

  it('shows model settings and lets the user change them before choosing an agent', async () => {
    const env = environment('claude');
    const questions: string[] = [];
    const replies = ['Configure agent model and effort…', 'claude', 'Change model and effort', 'opus', 'high'];
    const picked = await chooseExecution({
      env,
      write: () => undefined,
      pick: async (choices, question) => {
        questions.push(question ?? '');
        if (replies.length) return replies.shift()!;
        expect(choices[0]).toContain('model: opus; effort: high');
        return choices[0]!;
      },
    });
    expect(questions[0]).toContain('agent defaults may not be reported');
    expect(picked).toMatchObject({ builder: 'self', spec: { name: 'claude' } });
  });

  it('shows saved model and effort in the initial agent choice', async () => {
    const env = environment('claude');
    saveAgentSelection('claude', { model: 'sonnet', effort: 'medium' }, env);
    await chooseExecution({
      env,
      pick: async (choices) => {
        expect(choices[0]).toContain('model: sonnet; effort: medium');
        return '/quit';
      },
    });
  });
});

it('retains a pending MCP task without a checkout and retries without another picker', async () => {
  const pendingExecution: PendingExecution = {};
  let builder = 'platform';
  const posted: unknown[] = [];
  const api = {
    origin: 'https://example.test',
    request: async (method: string, path: string, body?: unknown) => {
      if (path === '/api/cli/chat')
        return { kind: 'action', action: { name: 'edit', request: 'make robots blue' }, conversationId: 'c' };
      if (path.endsWith('/handoff')) return { pending: true, builder: 'platform' };
      if (method === 'GET') return { slug: 'robots', builder, status: 'building' };
      if ((body as { prepareOnly?: boolean })?.prepareOnly) return { kind: 'proposal' };
      posted.push(body);
      return { kind: 'build', roundId: 2 };
    },
  } as unknown as ApiClient;
  const pick = vi.fn(async (choices: string[]) => choices[0]!);
  const input = { api, token: 'tok', env: environment(), pick, pendingExecution, write: () => undefined };
  await handleReplLine({ ...input, line: 'make robots blue' });
  expect(posted).toHaveLength(0);
  expect(pendingExecution.current?.request).toBe('make robots blue');
  builder = 'self';
  await handleReplLine({ ...input, line: '/retry' });
  expect(pick).toHaveBeenCalledTimes(1);
  expect(posted).toEqual([{ text: 'make robots blue' }]);
  expect(connectGame).toHaveBeenCalledWith(expect.objectContaining({ agent: 'claude' }));
  expect(pendingExecution.current).toBeUndefined();
});

it('remembers an explicit local choice before any round API request can fail', async () => {
  const env = environment();
  const { detectLocalAdapters } = await import('./workshop.js');
  const workshop = { adapters: detectLocalAdapters(env), env } as import('./workshop.js').Workshop;
  const pick = vi.fn(async (choices: string[]) => choices[0]!);
  const first = await chooseExecution({ env, workshop, pick });
  expect(workshop.selectedAgent).toBe('claude');
  expect(await chooseExecution({ env, workshop, pick })).toEqual(first);
  expect(pick).toHaveBeenCalledTimes(1);
});

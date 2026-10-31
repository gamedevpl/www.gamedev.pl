import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { historyStore } from './history.js';
import { runInkRepl } from './host.js';
import { handleReplLine } from '../repl.js';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import type { TuiSession } from './session.js';
import { startPlayBrain } from '../play-brain.js';
import type { Workshop } from '../workshop.js';

let promptText = 'add ramps';
let promptAnswers: string[] = [];
vi.mock('ink', () => ({ render: vi.fn(() => ({ unmount: vi.fn() })) }));
vi.mock('./app.js', () => ({ ReplApp: () => null }));
vi.mock('../main.js', () => ({ reportInstall: vi.fn() }));
vi.mock('../agents.js', () => ({ discoverAgents: () => [], agentHint: () => '' }));
vi.mock('../telemetry.js', () => ({ createCliTelemetry: () => ({ record: vi.fn(), flush: vi.fn() }) }));
vi.mock('../update-notice.js', () => ({ startUpdateNotice: () => vi.fn() }));
vi.mock('./round-watch.js', () => ({ createRoundWatch: () => ({ poke: vi.fn(), stop: vi.fn() }) }));
vi.mock('../repl.js', () => ({ handleReplLine: vi.fn(), replBanner: () => '' }));
vi.mock('../play-brain.js', () => ({
  BRAIN_AGENTS: ['claude', 'codex', 'copilot'],
  brainAgent: (ws: { selectedAgent?: string }) => ws.selectedAgent ?? 'claude',
  brainRequested: () => true,
  startPlayBrain: vi.fn(),
}));
vi.mock('./session.js', async (original) => {
  const actual = await original<typeof import('./session.js')>();
  return {
    ...actual,
    createTuiSession: (...args: Parameters<typeof actual.createTuiSession>) => ({
      ...actual.createTuiSession(...args),
      prompt: async () => promptAnswers.shift() ?? promptText,
    }),
  };
});
const homes: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  promptText = 'add ramps';
  promptAnswers = [];
  homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true }));
});

it.each(['/connect second', '/checkout second'])('keeps restored platform conversation after %s', async (command) => {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-host-'));
  homes.push(HOME);
  const origin = 'https://history.test';
  const conversationId = '12345678-1234-1234-1234-123456789012';
  const saved = historyStore({ HOME }, origin, 'owner', 'game:second');
  saved.save({ lines: ['old conversation'], prompts: ['old prompt'], conversationId });
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', slug: 'second', conversationId: '' })
    .mockResolvedValueOnce({ next: 'quit' });
  await runInkRepl({
    api: {
      origin,
      request: vi.fn().mockResolvedValue({ user: { uid: 'owner' } }),
      requestBytes: vi.fn(),
    },
    env: { HOME },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    slug: 'first',
    initialLine: command,
  });
  expect(vi.mocked(handleReplLine).mock.calls[1]![0].conversationId).toBe(conversationId);
  expect(saved.load().conversationId).toBe(conversationId);
});

it.each([false, true])('enables shell execution only for terminal prompts (browserOnly=%s)', async (browserOnly) => {
  vi.mocked(handleReplLine).mockResolvedValueOnce({ next: 'continue' }).mockResolvedValueOnce({ next: 'quit' });
  await runInkRepl({
    api: { origin: 'https://shell.test', request: vi.fn().mockResolvedValue({ user: { uid: 'owner' } }) } as Parameters<
      typeof runInkRepl
    >[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '!pwd',
    browserOnly,
  });
  expect(vi.mocked(handleReplLine).mock.calls[0]![0].allowShell).toBe(false);
  expect(vi.mocked(handleReplLine).mock.calls[1]![0].allowShell).toBe(!browserOnly);
});

it('paints the workspace and overlaps account and Studio reads before accepting commands', async () => {
  let accountReady!: (value: unknown) => void;
  let studioReady!: (value: string) => void;
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        accountReady = resolve;
      }),
  );
  const resolveToken = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        studioReady = resolve;
      }),
  );
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  vi.mocked(handleReplLine).mockResolvedValueOnce({ next: 'quit' });
  const run = runInkRepl({
    api: { origin: 'https://startup.test', request, requestBytes: vi.fn() } as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin, stdout: process.stdout },
    token: null,
    resolveToken,
    slug: 'sky',
    initialLine: '/connect sky',
  });
  try {
    expect(render).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(resolveToken).toHaveBeenCalledOnce();
    expect(handleReplLine).not.toHaveBeenCalled();
    const element = vi.mocked(render).mock.calls[0]![0] as { props: { session: TuiSession } };
    expect(element.props.session.get()).toMatchObject({
      mode: 'busy',
      activity: 'Connecting to Studio',
      identity: 'sky',
    });
    accountReady({ user: { uid: 'owner', handle: 'creator' } });
    await Promise.resolve();
    expect(handleReplLine).not.toHaveBeenCalled();
    studioReady('round');
    expect(await run).toBe(0);
    expect(handleReplLine).toHaveBeenCalledWith(expect.objectContaining({ token: 'round' }));
    expect(element.props.session.get().identity).toBe('creator · sky');
    expect(vi.mocked(render).mock.results[0]!.value.unmount).toHaveBeenCalledOnce();
  } finally {
    accountReady({ user: { uid: 'owner' } });
    studioReady('round');
    await run;
    stdin.destroy();
  }
});

it.each([
  ['a published game', { status: 'published', slug: 'snake' }],
  ['a game switched to the platform builder', { status: 'building', slug: 'snake', builder: 'platform' }],
])('sends a request for %s to the workshop instead of the Play agent', async (_label, round) => {
  const workshop = { slug: 'snake', root: '/tmp/snake', token: 'live', builder: 'self' } as Workshop;
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'snake', workshop })
    .mockResolvedValueOnce({ next: 'quit' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live' ? round : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout snake',
  });
  expect(startPlayBrain).not.toHaveBeenCalled();
  expect(vi.mocked(handleReplLine).mock.calls[1]![0]).toMatchObject({ line: 'add ramps', token: 'live' });
});

it('sends a published local Play request to the local agent without opening a round', async () => {
  promptText = 'Pograj w tę grę i opisz, co się dzieje';
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'platform',
    adapters: [{ name: 'claude' }],
  } as Workshop;
  const stop = new AbortController();
  const brain = {
    agent: {},
    turn: vi.fn(async () => stop.abort()),
    close: vi.fn(async () => {}),
  };
  vi.mocked(startPlayBrain).mockResolvedValueOnce(brain as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live'
      ? { status: 'published', slug: 'airtime', builder: 'platform' }
      : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
    shutdownSignal: stop.signal,
  });
  expect(brain.turn).toHaveBeenCalledWith(promptText);
  expect(startPlayBrain).toHaveBeenCalledWith(expect.objectContaining({ openRound: expect.any(Function) }));
  expect(request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  expect(handleReplLine).toHaveBeenCalledTimes(2);
});

it('asks which installed agent to use for a published game and keeps that selection', async () => {
  promptAnswers = ['Pograj w tę grę', 'codex'];
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'platform',
    adapters: [{ name: 'claude' }, { name: 'codex' }, { name: 'other' }],
  } as Workshop;
  const stop = new AbortController();
  const brain = { agent: {}, turn: vi.fn(async () => stop.abort()), close: vi.fn(async () => {}) };
  vi.mocked(startPlayBrain).mockResolvedValueOnce(brain as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live' ? { status: 'published', slug: 'airtime' } : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
    shutdownSignal: stop.signal,
  });
  expect(workshop.selectedAgent).toBe('codex');
  expect(brain.turn).toHaveBeenCalledWith('Pograj w tę grę');
});

it('does not launch an agent when the published-game selection is cancelled', async () => {
  promptAnswers = ['Pograj', 'Cancel', '/quit'];
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'platform',
    adapters: [{ name: 'claude' }, { name: 'codex' }],
  } as Workshop;
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' })
    .mockResolvedValueOnce({ next: 'quit' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live' ? { status: 'published', slug: 'airtime' } : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
  });
  expect(startPlayBrain).not.toHaveBeenCalled();
  expect(workshop.selectedAgent).toBeUndefined();
});

it('retries a failed published-game task through the same Play agent', async () => {
  promptAnswers = ['Pograj', '/retry'];
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'platform',
    adapters: [{ name: 'claude' }],
  } as Workshop;
  const stop = new AbortController();
  const brain = {
    agent: {},
    turn: vi.fn(async (_text, options) => {
      if (options?.retry) stop.abort();
      else workshop.failedTask = { request: 'Pograj', agent: 'claude', before: [], source: 'play-brain' };
    }),
    close: vi.fn(async () => {}),
  };
  vi.mocked(startPlayBrain).mockResolvedValueOnce(brain as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live' ? { status: 'published', slug: 'airtime' } : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
    shutdownSignal: stop.signal,
  });
  expect(brain.turn).toHaveBeenNthCalledWith(2, 'Pograj', { retry: true });
  expect(handleReplLine).toHaveBeenCalledTimes(2);
});

it('refuses a local retry after the round switches to the platform', async () => {
  promptAnswers = ['Pograj', '/retry', '/quit'];
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'self',
    adapters: [{ name: 'claude' }],
  } as Workshop;
  let switched = false;
  const brain = {
    agent: {},
    turn: vi.fn(async () => {
      workshop.failedTask = { request: 'Pograj', agent: 'claude', before: [], source: 'play-brain' };
      switched = true;
    }),
    close: vi.fn(async () => {}),
  };
  vi.mocked(startPlayBrain).mockResolvedValueOnce(brain as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' })
    .mockResolvedValueOnce({ next: 'quit' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live'
      ? { status: switched ? 'building' : 'published', slug: 'airtime', builder: switched ? 'platform' : 'self' }
      : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
  });
  expect(brain.turn).toHaveBeenCalledTimes(1);
});

it('restarts the Play agent with published-round handling when the game ships', async () => {
  const workshop = {
    slug: 'airtime',
    root: '/tmp/airtime',
    token: 'live',
    builder: 'self',
    adapters: [{ name: 'claude' }],
  } as Workshop;
  const stop = new AbortController();
  let published = false;
  const first = { agent: {}, turn: vi.fn(async () => void (published = true)), close: vi.fn(async () => {}) };
  const second = { agent: {}, turn: vi.fn(async () => stop.abort()), close: vi.fn(async () => {}) };
  vi.mocked(startPlayBrain)
    .mockResolvedValueOnce(first as unknown as Awaited<ReturnType<typeof startPlayBrain>>)
    .mockResolvedValueOnce(second as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'airtime', workshop })
    .mockResolvedValueOnce({ next: 'continue' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live'
      ? { status: published ? 'published' : 'building', slug: 'airtime', builder: 'self' }
      : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://published.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout airtime',
    browserOnly: true,
    shutdownSignal: stop.signal,
  });
  expect(first.close).toHaveBeenCalledOnce();
  expect(startPlayBrain).toHaveBeenCalledTimes(2);
  expect(vi.mocked(startPlayBrain).mock.calls[1]![0]).toHaveProperty('openRound', expect.any(Function));
  expect(second.turn).toHaveBeenCalledOnce();
});

it('starts a fresh Play agent when the creator picks another agent', async () => {
  const workshop = { slug: 'snake', root: '/tmp/snake', token: 'live', builder: 'self' } as Workshop;
  const first = {
    agent: {},
    turn: vi.fn(async () => void (workshop.selectedAgent = 'codex')),
    close: vi.fn(async () => {}),
  };
  const second = {
    agent: {},
    turn: vi.fn(async () => void (workshop.builder = 'platform')),
    close: vi.fn(async () => {}),
  };
  vi.mocked(startPlayBrain)
    .mockResolvedValueOnce(first as unknown as Awaited<ReturnType<typeof startPlayBrain>>)
    .mockResolvedValueOnce(second as unknown as Awaited<ReturnType<typeof startPlayBrain>>);
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', token: 'live', slug: 'snake', workshop })
    .mockResolvedValueOnce({ next: 'quit' });
  const request = vi.fn(async (_method: string, path: string) =>
    path === '/api/submissions/live'
      ? { status: 'building', slug: 'snake', builder: 'self' }
      : { user: { uid: 'owner' } },
  );
  await runInkRepl({
    api: { origin: 'https://switch.test', request } as unknown as Parameters<typeof runInkRepl>[0]['api'],
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/checkout snake',
  });
  expect(startPlayBrain).toHaveBeenCalledTimes(2);
  expect(first.close).toHaveBeenCalled();
  expect(second.turn).toHaveBeenCalledWith('add ramps');
});

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

vi.mock('ink', () => ({ render: vi.fn(() => ({ unmount: vi.fn() })) }));
vi.mock('./app.js', () => ({ ReplApp: () => null }));
vi.mock('../main.js', () => ({ reportInstall: vi.fn() }));
vi.mock('../agents.js', () => ({ discoverAgents: () => [], agentHint: () => '' }));
vi.mock('../telemetry.js', () => ({ createCliTelemetry: () => ({ record: vi.fn(), flush: vi.fn() }) }));
vi.mock('../update-notice.js', () => ({ startUpdateNotice: () => vi.fn() }));
vi.mock('./round-watch.js', () => ({ createRoundWatch: () => ({ poke: vi.fn(), stop: vi.fn() }) }));
vi.mock('../repl.js', () => ({ handleReplLine: vi.fn(), replBanner: () => '' }));
vi.mock('../play-brain.js', () => ({
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
      prompt: async () => 'add ramps',
    }),
  };
});
const homes: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
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

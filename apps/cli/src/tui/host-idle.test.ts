import { expect, it, vi } from 'vitest';
import { runInkRepl } from './host.js';
import { handleReplLine } from '../repl.js';
import { sessionBrowserHost } from '../session-browser-host.js';
import type { SessionController } from '../session-controller.js';

vi.mock('ink', () => ({ render: () => ({ unmount: vi.fn() }) }));
vi.mock('./app.js', () => ({ ReplApp: () => null }));
vi.mock('../main.js', () => ({ reportInstall: vi.fn() }));
vi.mock('../agents.js', () => ({ discoverAgents: () => [], agentHint: () => '' }));
vi.mock('../telemetry.js', () => ({ createCliTelemetry: () => ({ record: vi.fn(), flush: vi.fn() }) }));
vi.mock('../update-notice.js', () => ({ startUpdateNotice: () => vi.fn() }));
vi.mock('./round-watch.js', () => ({ createRoundWatch: () => ({ poke: vi.fn(), stop: vi.fn() }) }));
vi.mock('../repl.js', () => ({ handleReplLine: vi.fn(), replBanner: () => '' }));
vi.mock('../session-browser-host.js', () => ({ sessionBrowserHost: vi.fn() }));

it('defers shutdown through a task question and remote operation, then exits through normal cleanup', async () => {
  let session!: SessionController;
  let canStop!: () => boolean;
  const close = vi.fn(async () => {});
  vi.mocked(sessionBrowserHost).mockImplementation((owner, _headless, _workspace, guard) => {
    session = owner;
    canStop = guard!;
    return {
      start: async () => 'http://127.0.0.1/',
      close,
      registerPreview: vi.fn(),
      registerPlatform: vi.fn(),
      open: vi.fn(async () => true),
    };
  });
  let release!: () => void;
  vi.mocked(handleReplLine).mockImplementation(async (input) => {
    if (input.line === '/quit') return { next: 'quit' };
    await input.pick!(['Continue'], 'Which operation?');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { next: 'continue' };
  });
  const run = runInkRepl({
    api: {
      origin: 'https://example.test',
      request: vi.fn().mockResolvedValue({ user: { uid: 'owner' } }),
      requestBytes: vi.fn(),
    },
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/status',
    browserOnly: true,
  });
  try {
    await vi.waitFor(() => expect(session.get().mode).toBe('pick'));
    expect(canStop()).toBe(false);
    session.submit();
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(canStop()).toBe(false);
    release();
    await vi.waitFor(() => expect(canStop()).toBe(true));
    expect(session.get().mode).toBe('prompt');
    session.close();
    expect(await run).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    release?.();
    session.close();
    await run;
  }
});

it('aborts an active operation on terminal shutdown and closes the browser through normal cleanup', async () => {
  const close = vi.fn(async () => {});
  vi.mocked(sessionBrowserHost).mockImplementation(() => ({
    start: async () => 'http://127.0.0.1/',
    close,
    registerPreview: vi.fn(),
    registerPlatform: vi.fn(),
    open: vi.fn(async () => true),
  }));
  let active: AbortController | undefined;
  vi.mocked(handleReplLine).mockImplementation(async (input) => {
    active = new AbortController();
    input.abort!.current = active;
    await new Promise<void>((resolve) => active!.signal.addEventListener('abort', () => resolve(), { once: true }));
    input.abort!.current = null;
    return { next: 'continue' };
  });
  const shutdown = new AbortController();
  const run = runInkRepl({
    api: {
      origin: 'https://example.test',
      request: vi.fn().mockResolvedValue({ user: { uid: 'owner' } }),
      requestBytes: vi.fn(),
    },
    env: { GAMEDEV_HISTORY: 'off' },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    initialLine: '/status',
    browserOnly: true,
    detached: false,
    shutdownSignal: shutdown.signal,
  });
  try {
    await vi.waitFor(() => expect(active).toBeDefined());
    shutdown.abort();
    expect(await run).toBe(0);
    expect(active!.signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    shutdown.abort();
    await run;
  }
});

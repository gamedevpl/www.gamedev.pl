import { requireClaudeSubscription } from './claude-auth.js';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runLocalBuild, type Workshop } from './workshop.js';
import { startLocalPlay } from './play.js';
import { preflightAdapter } from './adapters.js';
import { EventEmitter } from 'node:events';
vi.mock('./play.js', () => ({ startLocalPlay: vi.fn(async () => ({ url: 'http://127.0.0.1:1/' })) }));
vi.mock('./prepare-workspace.js', () => ({ prepareWorkspace: vi.fn(async () => undefined) }));
vi.mock('./adapters.js', async (original) => ({
  ...(await original<typeof import('./adapters.js')>()),
  preflightAdapter: vi.fn(),
}));
vi.mock('./delegate.js', async (original) => ({
  ...(await original<typeof import('./delegate.js')>()),
  spawnAdapter: vi.fn(() => {
    const child = new EventEmitter();
    setTimeout(() => child.emit('close', 0), 0);
    return child;
  }),
}));
vi.mock('./claude-auth.js', async (original) => ({
  ...(await original<typeof import('./claude-auth.js')>()),
  requireClaudeSubscription: vi.fn(async () => undefined),
}));
const roots: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it.each([true, false])('starts a preview only in interactive delegation: unattended=%s', async (unattended) => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-workshop-preview-'));
  roots.push(root);
  mkdirSync(join(root, 'games/robot'), { recursive: true });
  const spec = {
    name: 'claude',
    command: 'claude',
    headless: [],
    versionFlag: '--help',
    events: { flag: '', dialect: 'ndjson' as const },
    cwd: 'game-dir' as const,
    exit: { success: [0], failure: [1] },
  };
  const ws: Workshop = {
    root,
    slug: 'robot',
    token: 'tok',
    env: {},
    adapters: [spec],
    builder: 'self',
    pick: async () => '',
    abort: { current: null },
    run: () => ({ status: 0, stderr: '' }),
    ...(unattended ? { unattended: { deliver: false } } : {}),
  };
  await expect(runLocalBuild({ ws, spec, brief: 'test', write: () => undefined })).resolves.toBe(true);
  expect(preflightAdapter).toHaveBeenCalled();
  expect(requireClaudeSubscription).toHaveBeenCalledTimes(1);
  const { spawnAdapter } = await import('./delegate.js');
  expect(spawnAdapter).toHaveBeenCalledWith(expect.objectContaining({ authCheck: expect.any(Promise) }));
  expect(startLocalPlay).toHaveBeenCalledTimes(unattended ? 0 : 1);
  if (!unattended)
    expect(startLocalPlay).toHaveBeenCalledWith(expect.objectContaining({ abort: expect.any(AbortSignal) }));
});

it.each([true, false])('distinguishes empty Antigravity runs from partial Claude refusals: empty=%s', async (empty) => {
  const run = vi.fn(() => ({ status: 0, stderr: '' }));
  const write = vi.fn();
  const spec = {
    name: empty ? 'agy' : 'claude',
    command: empty ? 'agy' : 'claude',
    headless: [],
    versionFlag: '--help',
    events: { flag: '', dialect: 'ndjson' as const },
    cwd: 'game-dir' as const,
    exit: { success: [0], failure: [1] },
  };
  const ws: Workshop = {
    root: '/checkout',
    slug: 'robot',
    token: 'tok',
    env: {},
    adapters: [spec],
    builder: 'self',
    pick: async () => '',
    abort: { current: null },
    run,
    runAdapter: async (input) => {
      input.onLine?.(
        empty
          ? 'jetski: no output produced — headless mode cannot prompt, so it was auto-denied.'
          : JSON.stringify({ type: 'result', result: 'Edited hair', permission_denials: [{ tool_name: 'Bash' }] }),
      );
      return { code: 0 };
    },
  };
  expect(await runLocalBuild({ ws, spec, brief: 'Fix hair', write })).toBe(!empty);
  if (empty) {
    expect(run).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('No successful edit is confirmed'));
  } else {
    expect(run).toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith('✓ static ladder green');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Some tools were denied'));
  }
});

it('checks subscription before preparation, preview, telemetry or agent launch', async () => {
  const { prepareWorkspace } = await import('./prepare-workspace.js');
  const { spawnAdapter } = await import('./delegate.js');
  vi.mocked(requireClaudeSubscription).mockRejectedValueOnce(new Error('subscription refused'));
  const record = vi.fn();
  const spec = {
    name: 'claude',
    command: 'claude',
    headless: [],
    versionFlag: '--help',
    events: { flag: '', dialect: 'ndjson' as const },
    cwd: 'game-dir' as const,
    exit: { success: [0], failure: [1] },
  };
  const ws: Workshop = {
    root: '/checkout',
    slug: 'robot',
    token: 'tok',
    env: {},
    adapters: [spec],
    builder: 'self',
    pick: async () => '',
    abort: { current: null },
    telemetry: { record } as unknown as Workshop['telemetry'],
  };
  await expect(runLocalBuild({ ws, spec, brief: 'Fix hair', write: vi.fn() })).rejects.toThrow('subscription refused');
  expect(prepareWorkspace).not.toHaveBeenCalled();
  expect(startLocalPlay).not.toHaveBeenCalled();
  expect(spawnAdapter).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
  expect(ws.abort.current).toBeNull();
});

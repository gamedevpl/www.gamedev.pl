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
    name: 'fixture',
    command: 'fixture',
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
  expect(startLocalPlay).toHaveBeenCalledTimes(unattended ? 0 : 1);
  if (!unattended)
    expect(startLocalPlay).toHaveBeenCalledWith(expect.objectContaining({ abort: expect.any(AbortSignal) }));
});

it('refuses an exit-zero task with denied permissions before running verification', async () => {
  const run = vi.fn(() => ({ status: 0, stderr: '' }));
  const write = vi.fn();
  const spec = {
    name: 'agy',
    command: 'agy',
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
      input.onLine?.('jetski: no output produced — headless mode cannot prompt, so it was auto-denied.');
      return { code: 0 };
    },
  };
  expect(await runLocalBuild({ ws, spec, brief: 'Fix hair', write })).toBe(false);
  expect(run).not.toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('No successful edit is confirmed'));
});

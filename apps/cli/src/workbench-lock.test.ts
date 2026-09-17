import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { acquireStartupLock } from './workbench-startup-lock.js';
import { withCheckoutWriter } from './workbench-lock.js';
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, mkdirSync: vi.fn(fs.mkdirSync), writeFileSync: vi.fn(fs.writeFileSync) };
});
const roots: string[] = [];
function root() {
  const path = mkdtempSync(join(tmpdir(), 'play-lock-test-'));
  roots.push(path);
  return path;
}
afterEach(() => {
  roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});
it('cleans failed writer ownership persistence so a later writer can acquire', async () => {
  const path = root();
  vi.mocked(writeFileSync).mockImplementationOnce(() => {
    throw Error('disk full');
  });
  await expect(withCheckoutWriter(path, async () => 1)).rejects.toThrow('disk full');
  await expect(withCheckoutWriter(path, async () => 2)).resolves.toBe(2);
});
it('cleans failed startup ownership persistence and records a subsequent owner', () => {
  const path = join(root(), 'startup.lock');
  vi.mocked(writeFileSync).mockImplementationOnce(() => {
    throw Error('disk full');
  });
  expect(() => acquireStartupLock(path)).toThrow('disk full');
  expect(existsSync(path)).toBe(false);
  const release = acquireStartupLock(path);
  expect(JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'))).toMatchObject({ pid: process.pid });
  release();
  expect(existsSync(path)).toBe(false);
});
it.each([true, false])(
  'preserves an existing startup lock and explains safe recovery (owner recorded: %s)',
  (recorded) => {
    const path = join(root(), 'startup.lock');
    mkdirSync(path);
    if (recorded) writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: 1234 }));
    expect(() => acquireStartupLock(path, 5678)).toThrow(
      'confirm the launcher, controller and child agent have all exited',
    );
    expect(() => acquireStartupLock(path, 5678)).toThrow('previous controller PID: 5678');
    expect(existsSync(path)).toBe(true);
  },
);

it.each(['EACCES', 'ENOSPC', 'EEXIST'])('preserves writer mkdir error %s', async (code) => {
  const path = root();
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const error = Object.assign(Error(code), { code });
  const run = vi.fn();
  vi.mocked(mkdirSync).mockImplementation((target, options) => {
    if (/[/\\][a-f0-9]{64}$/.test(String(target))) throw error;
    return fs.mkdirSync(target, options);
  });
  try {
    const attempt = withCheckoutWriter(path, run);
    if (code === 'EEXIST') {
      await expect(attempt).rejects.toMatchObject({
        message: expect.stringContaining('owns this checkout'),
        cause: error,
      });
    } else await expect(attempt).rejects.toBe(error);
    expect(run).not.toHaveBeenCalled();
  } finally {
    vi.mocked(mkdirSync).mockImplementation(fs.mkdirSync);
  }
});

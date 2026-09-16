import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { acquireStartupLock } from './workbench-startup-lock.js';
import { withCheckoutWriter } from './workbench-lock.js';
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync) };
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
    expect(() => acquireStartupLock(path, 5678)).toThrow('recorded child PID: 5678');
    expect(existsSync(path)).toBe(true);
  },
);

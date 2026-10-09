import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withCredentialLock } from './credential-lock.js';

const roots: string[] = [];
function file() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-credential-lock-'));
  roots.push(root);
  return join(root, 'credentials.bin');
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('serializes owners and cleans up after a failed transaction', async () => {
  const path = file();
  let release!: () => void;
  let entered = false;
  const first = withCredentialLock(
    path,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  const second = withCredentialLock(path, async () => {
    entered = true;
    throw new Error('test failure');
  });
  const failure = expect(second).rejects.toThrow('test failure');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(entered).toBe(false);
  release();
  await first;
  await failure;
  expect(existsSync(`${path}.lock`)).toBe(false);
  await expect(withCredentialLock(path, async () => 'next')).resolves.toBe('next');
});

it('cancels a waiter without releasing a live owner', async () => {
  const path = file();
  let release!: () => void;
  const first = withCredentialLock(
    path,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  const controller = new AbortController();
  const second = withCredentialLock(
    path,
    async () => {
      throw new Error('must not enter');
    },
    controller.signal,
  );
  const failure = expect(second).rejects.toThrow();
  controller.abort();
  await failure;
  expect(existsSync(`${path}.lock`)).toBe(true);
  expect(readdirSync(roots.at(-1)!)).toEqual(['credentials.bin.lock']);
  release();
  await first;
});

it('recovers a dead owner safely when two contenders race', async () => {
  const path = file();
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const pid = child.pid!;
  await once(child, 'exit');
  mkdirSync(`${path}.lock`, { mode: 0o700 });
  writeFileSync(join(`${path}.lock`, `${pid}-${randomUUID()}`), '', { mode: 0o600 });
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 2 }, () =>
      withCredentialLock(path, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active--;
      }),
    ),
  );
  expect(peak).toBe(1);
  expect(existsSync(`${path}.lock`)).toBe(false);
});

it('allows nested writes in the same transaction', async () => {
  const path = file();
  await expect(withCredentialLock(path, () => withCredentialLock(path, async () => 'done'))).resolves.toBe('done');
});

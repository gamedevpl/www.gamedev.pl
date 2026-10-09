import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withCredentialLock } from './credential-lock.js';

vi.mock('node:fs', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...fs, unlinkSync: vi.fn(fs.unlinkSync), renameSync: vi.fn(fs.renameSync) };
});

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

it('waits on Windows-style rename contention when the existing lock is valid', async () => {
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
  vi.mocked(renameSync).mockImplementationOnce(() => {
    throw Object.assign(new Error('target exists'), { code: 'EPERM' });
  });
  const second = withCredentialLock(path, async () => 'second');
  release();
  await first;
  await expect(second).resolves.toBe('second');
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

it('recovers a stale lock whose PID was reused by a live process', async () => {
  const path = file();
  mkdirSync(`${path}.lock`, { mode: 0o700 });
  writeFileSync(
    join(`${path}.lock`, `${process.pid}-${randomUUID()}`),
    JSON.stringify({ startIdentity: 'previous-process-start' }),
    { mode: 0o600 },
  );
  await expect(withCredentialLock(path, async () => 'recovered')).resolves.toBe('recovered');
  expect(existsSync(`${path}.lock`)).toBe(false);
});

it('preserves a successor acquiring the directory during owner cleanup', async () => {
  const path = file();
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const nextMarker = `${process.pid}-${randomUUID()}`;
  const candidate = `${path}.next`;
  mkdirSync(candidate, { mode: 0o700 });
  writeFileSync(join(candidate, nextMarker), '', { mode: 0o600 });
  vi.mocked(unlinkSync).mockImplementationOnce((marker) => {
    fs.unlinkSync(marker);
    renameSync(candidate, `${path}.lock`);
  });
  await expect(withCredentialLock(path, async () => 'finished')).resolves.toBe('finished');
  expect(readdirSync(`${path}.lock`)).toEqual([nextMarker]);
});

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

const held = new AsyncLocalStorage<Set<string>>();

function recoverDeadOwner(path: string): void {
  try {
    const stat = lstatSync(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700))
    ) {
      throw new CliError('unsafe sign-in lock', EXIT_REFUSED);
    }
    const files = readdirSync(path);
    if (files.length !== 1) return;
    const owner = files[0]!;
    const match = /^(\d+)-[a-f0-9-]{36}$/.exec(owner);
    if (!match) return;
    try {
      process.kill(Number(match[1]), 0);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return;
    }
    // Only the reaper removing this unique marker may remove its directory.
    unlinkSync(join(path, owner));
    rmdirSync(path);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}

export async function withCredentialLock<T>(file: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const key = resolve(file);
  signal?.throwIfAborted();
  if (held.getStore()?.has(key)) return run();
  mkdirSync(dirname(key), { recursive: true });
  const lock = `${key}.lock`;
  const marker = `${process.pid}-${randomUUID()}`;
  const candidate = `${lock}-${marker}`;
  mkdirSync(candidate, { mode: 0o700 });
  let acquired = false;
  const deadline = Date.now() + 30_000;
  try {
    writeFileSync(join(candidate, marker), '', { mode: 0o600, flag: 'wx' });
    while (!acquired) {
      signal?.throwIfAborted();
      try {
        renameSync(candidate, lock);
        acquired = true;
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        recoverDeadOwner(lock);
        if (Date.now() >= deadline) {
          throw new CliError('another gamedevpl process is updating sign-in', EXIT_REFUSED, 'retry in a moment');
        }
        await setTimeout(25, undefined, { signal });
      }
    }
    const keys = new Set(held.getStore() ?? []);
    keys.add(key);
    return await held.run(keys, run);
  } finally {
    if (acquired) {
      unlinkSync(join(lock, marker));
      rmdirSync(lock);
    } else {
      rmSync(candidate, { recursive: true, force: true });
    }
  }
}

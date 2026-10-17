import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privatePlayDirectory } from './play-state.js';

const transaction = new AsyncLocalStorage<Set<string>>();
export async function withCheckoutWriter<T>(
  root: string,
  run: () => Promise<T>,
  options: { history?: boolean; recoverHistory?: boolean } = {},
): Promise<T> {
  if (!existsSync(root)) return run();
  const canonical = realpathSync(root);
  if (transaction.getStore()?.has(canonical)) return run();
  const dir = privatePlayDirectory(join(tmpdir(), `gamedev-writers-${process.getuid?.() ?? 'user'}`));
  const lock = join(dir, createHash('sha256').update(canonical).digest('hex'));
  const instance = randomUUID();
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (options.recoverHistory && clearDeadHistoryWriter(lock, canonical)) {
      mkdirSync(lock, { mode: 0o700 });
    } else {
      throw Error(
        'Another CLI operation owns this checkout. If it crashed, confirm its child agent has exited before removing the writer lock.',
        { cause: error },
      );
    }
  }
  try {
    writeFileSync(
      join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, instance, root: canonical, ...(options.history ? { history: true } : {}) }),
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
  } catch (error) {
    rmSync(lock, { recursive: true, force: true });
    throw error;
  }
  const roots = new Set(transaction.getStore() ?? []);
  roots.add(canonical);
  try {
    return await transaction.run(roots, run);
  } finally {
    releaseWriter(lock, instance);
  }
}

function clearDeadHistoryWriter(lock: string, root: string): boolean {
  const ownerPath = join(lock, 'owner.json'),
    claim = join(lock, 'history-recovery'),
    nonce = randomUUID();
  const readOwner = () => {
    const stat = lstatSync(ownerPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('Invalid writer owner');
    return JSON.parse(readFileSync(ownerPath, 'utf8')) as {
      pid: number;
      instance: string;
      root: string;
      history?: boolean;
    };
  };
  const dead = (owner: ReturnType<typeof readOwner>) => {
    if (
      owner.history !== true ||
      owner.root !== root ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.instance !== 'string'
    )
      return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
  };
  try {
    const owner = readOwner();
    if (!dead(owner)) return false;
    writeFileSync(claim, nonce, { flag: 'wx', mode: 0o600 });
    const checked = readOwner();
    if (checked.instance !== owner.instance || !dead(checked)) return false;
    rmSync(lock, { recursive: true });
    return true;
  } catch {
    return false;
  } finally {
    releaseHistoryClaim(claim, nonce);
  }
}

function releaseHistoryClaim(claim: string, nonce: string): void {
  try {
    if (readFileSync(claim, 'utf8') === nonce) rmSync(claim);
  } catch {
    return;
  }
}

function releaseWriter(lock: string, instance: string): void {
  try {
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')) as { instance: string };
    if (owner.instance === instance) rmSync(lock, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privatePlayDirectory } from './play-state.js';

const transaction = new AsyncLocalStorage<Set<string>>();
export async function withCheckoutWriter<T>(root: string, run: () => Promise<T>): Promise<T> {
  if (!existsSync(root)) return run();
  const canonical = realpathSync(root);
  if (transaction.getStore()?.has(canonical)) return run();
  const dir = privatePlayDirectory(join(tmpdir(), `gamedev-writers-${process.getuid?.() ?? 'user'}`));
  const lock = join(dir, createHash('sha256').update(canonical).digest('hex'));
  const instance = randomUUID();
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw Error(
      'Another CLI operation owns this checkout. If it crashed, confirm its child agent has exited before removing the writer lock.',
    );
  }
  try {
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, instance, root: canonical }), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    rmSync(lock, { recursive: true, force: true });
    throw error;
  }
  const roots = new Set(transaction.getStore() ?? []);
  roots.add(canonical);
  try {
    return await transaction.run(roots, run);
  } finally {
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')) as { instance: string };
    if (owner.instance === instance) rmSync(lock, { recursive: true, force: true });
  }
}

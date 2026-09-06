import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startLocalPlay } from './play.js';
import { privatePlayDirectory } from './play-state.js';
it('cancels while another process owns startup without deleting its lock', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-cancel-test-'));
  const key = createHash('sha256')
    .update(`${realpathSync(root)}\0robot`)
    .digest('hex');
  const dir = privatePlayDirectory(join(tmpdir(), `gamedev-play-${process.getuid?.() ?? 'user'}`));
  const lock = join(dir, `${key}.lock`);
  mkdirSync(lock);
  writeFileSync(join(lock, 'owner'), String(process.pid));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30);
  try {
    await expect(
      startLocalPlay({ root, slug: 'robot', env: process.env, abort: controller.signal, write: () => undefined }),
    ).rejects.toThrow('cancelled');
    expect(existsSync(lock)).toBe(true);
  } finally {
    clearTimeout(timer);
    rmSync(lock, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

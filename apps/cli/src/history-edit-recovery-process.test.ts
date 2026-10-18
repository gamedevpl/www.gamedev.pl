import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupHistoryFixtures, historyFixture, sourceLines } from '../test/history-edit-fixture.js';
import { sourceSnapshot } from './history-edit-files.js';

afterEach(cleanupHistoryFixtures);
describe.skipIf(process.platform === 'win32')('history writer crash recovery', () => {
  it.each(['history', 'agent'])('recovers only dead history writers, writer=%s', async (kind) => {
    const f = historyFixture(),
      restored = await f.run(),
      id = basename(restored.backup!);
    writeFileSync(
      join(f.root, '.gamedev/history-pending.json'),
      JSON.stringify({ id, source: f.prefix, result: sourceSnapshot(f.game).digest, committed: false }),
    );
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
      const {withCheckoutWriter}=await import(process.argv[1]);
      await withCheckoutWriter(process.argv[2],async()=>{console.log('locked');setInterval(()=>{},1000);await new Promise(()=>{});},{history:process.argv[3]==='history',recoverHistory:true});
    `,
        new URL('./workbench-lock.ts', import.meta.url).href,
        f.root,
        kind,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const closed = once(child, 'close');
    const lock = join(
      tmpdir(),
      `gamedev-writers-${process.getuid?.() ?? 'user'}`,
      createHash('sha256').update(realpathSync(f.root)).digest('hex'),
    );
    try {
      await once(child.stdout, 'data');
      await expect(f.run('restore', [], { recover: true })).rejects.toThrow('owns this checkout');
      child.kill('SIGKILL');
      await closed;
      if (kind === 'history') {
        await f.run('restore', [], { recover: true });
        expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
        expect(existsSync(join(f.root, '.gamedev/history-pending.json'))).toBe(false);
        expect(existsSync(lock)).toBe(false);
      } else {
        await expect(f.run('restore', [], { recover: true })).rejects.toThrow('owns this checkout');
        expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(1, 1));
        expect(existsSync(lock)).toBe(true);
      }
    } finally {
      child.kill('SIGKILL');
      await closed;
      rmSync(lock, { recursive: true, force: true });
    }
  });
});

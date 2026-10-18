import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';

afterEach(cleanupHistoryFixtures);
describe.skipIf(process.platform === 'win32')('pending native merge writer recovery', () => {
  it.each(['history', 'agent'])('reclaims only a dead local writer, owner=%s', async (kind) => {
    const f = localChangesFixture();
    f.draft();
    f.advance();
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
      const {withCheckoutWriter}=await import(process.argv[1]);
      await withCheckoutWriter(process.argv[2],async()=>{console.log('locked');setInterval(()=>{},1000);await new Promise(()=>{});},{resolveMerge:true,history:process.argv[3]==='history'});
    `,
        new URL('./workbench-lock.ts', import.meta.url).href,
        f.root,
        kind,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const closed = once(child, 'close'),
      lock = join(
        tmpdir(),
        `gamedev-writers-${process.getuid?.() ?? 'user'}`,
        createHash('sha256').update(realpathSync(f.root)).digest('hex'),
      );
    try {
      await once(child.stdout, 'data');
      await expect(f.resolve([], { abort: true })).rejects.toThrow('owns this checkout');
      child.kill('SIGKILL');
      await closed;
      if (kind === 'history') {
        await f.resolve([], { abort: true });
        expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
        expect(existsSync(lock)).toBe(false);
      } else {
        await expect(f.resolve([], { abort: true })).rejects.toThrow('owns this checkout');
        expect(existsSync(lock)).toBe(true);
      }
    } finally {
      child.kill('SIGKILL');
      await closed;
      rmSync(lock, { recursive: true, force: true });
    }
  });
});

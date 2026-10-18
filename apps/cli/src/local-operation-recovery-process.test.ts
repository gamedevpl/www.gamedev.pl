import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { readLocalOperation } from './local-operation.js';

afterEach(cleanupHistoryFixtures);
describe.skipIf(process.platform === 'win32')('pending native merge writer recovery', () => {
  it.each(['before-remove', 'after-remove'])(
    'resumes an abort killed %s and returns the original resolution backup',
    async (point) => {
      const f = localChangesFixture();
      f.draft();
      f.advance();
      await expect(f.pull()).rejects.toThrow('Pull conflicts');
      f.draft('resolution work to preserve\n');
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `
      const fs=await import('node:fs'),{join}=await import('node:path'),{syncBuiltinESMExports}=await import('node:module');
      const original=fs.default.rmSync,target=join(process.argv[1],'.gamedev/merge.json');
      fs.default.rmSync=(path,options)=>{
        if(path===target && process.argv[3]==='before-remove')process.kill(process.pid,'SIGKILL');
        const result=original(path,options);
        if(path===target && process.argv[3]==='after-remove')process.kill(process.pid,'SIGKILL');
        return result;
      };
      syncBuiltinESMExports();
      const {resolveCommand}=await import(process.argv[2]);
      await resolveCommand({api:{origin:'https://example.invalid',request:async()=>{throw Error('unexpected network');}},cwd:process.argv[1],args:[],flags:{abort:true},write:()=>{}});
    `,
          f.root,
          new URL('./local-change-command.ts', import.meta.url).href,
          point,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let errors = '';
      child.stderr.on('data', (chunk) => {
        errors += String(chunk);
      });
      const closed = once(child, 'close'),
        lock = join(
          tmpdir(),
          `gamedev-writers-${process.getuid?.() ?? 'user'}`,
          createHash('sha256').update(realpathSync(f.root)).digest('hex'),
        );
      try {
        const [, signal] = await closed;
        expect(signal, errors).toBe('SIGKILL');
        expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
        expect(readLocalOperation(f.root)?.phase ?? null).toBe(point === 'before-remove' ? 'aborting' : null);
        f.draft('new draft after interrupted abort\n');
        const result = (await f.resolve([], { abort: true })) as { backup: string };
        expect(readFileSync(join(result.backup, 'game.ts'), 'utf8')).toBe('resolution work to preserve\n');
        expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('new draft after interrupted abort\n');
        expect(await f.resolve([], { abort: true })).toMatchObject({ backup: result.backup, replayed: true });
      } finally {
        child.kill('SIGKILL');
        await closed;
        rmSync(lock, { recursive: true, force: true });
      }
    },
  );
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

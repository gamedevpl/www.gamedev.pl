import { PassThrough } from 'node:stream';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { runCli } from './main.js';
import { handleReplLine } from './repl.js';
import { readBase } from './checkout.js';
import { parseArgv, completeSlash } from './argv.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanupHistoryFixtures();
});
it.each(['shell', 'slash'])('runs stash, resolution and pull completion through %s', async (entry) => {
  const f = localChangesFixture();
  f.draft();
  const run = async (args: string[], line = '/' + args.join(' ')) => {
    const output: string[] = [];
    if (entry === 'shell') {
      vi.stubGlobal('fetch', f.fetchFixture);
      vi.spyOn(process, 'cwd').mockReturnValue(f.root);
      const stdout = new PassThrough();
      stdout.on('data', (chunk) => output.push(String(chunk)));
      const code = await runCli(
        ['node', 'cli', ...args],
        { GAMEDEV_TOKEN: 'fixture' },
        {
          stdin: new PassThrough() as NodeJS.ReadStream,
          stdout: stdout as NodeJS.WriteStream,
          stderr: stdout as NodeJS.WriteStream,
        },
      );
      return { code, text: output.join('') };
    }
    await handleReplLine({ line, api: f.api, token: null, cwd: f.root, write: (text) => output.push(text) });
    return { code: 0, text: output.join('\n') };
  };
  expect((await run(['stash', 'push', '-m', 'a saved draft'], '/stash push -m "a saved draft"')).text).toContain(
    'a saved draft',
  );
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
  expect((await run(['stash', 'list', '--json'])).text).toContain('a saved draft');
  await run(['stash', 'pop']);
  f.advance();
  expect((await run(['pull'])).text).toContain('Pull conflicts');
  expect((await run(['status', '--json'])).text).toContain('"operation"');
  expect((await run(['resolve'])).text).toContain('game.ts');
  expect((await run(['resolve', 'game.ts', '--ours'])).text).toContain('Resolved');
  expect((await run(['pull', '--continue'])).text).toContain('Merge completed');
  expect(readBase(f.root)?.version).toBe('v4');
  f.trees.v5 = f.trees.v4!.map((file) => (file.path === 'game.ts' ? { ...file, content: sourceLines(7, 3) } : file));
  f.versions.unshift({ ...f.versions[0]!, version: 'v5' });
  writeFileSync(join(f.game, 'game.ts'), sourceLines(6, 3));
  await run(['pull']);
  expect((await run(['pull', '--abort'])).text).toContain('Merge aborted');
  expect(readBase(f.root)?.version).toBe('v4');
});
it('parses stash descriptions and exposes slash completion without swallowing a path', () => {
  expect(parseArgv('/stash push -m "a draft with spaces"')).toMatchObject({
    verb: 'stash',
    args: ['push'],
    flags: { message: 'a draft with spaces' },
  });
  expect(parseArgv('/resolve --theirs game.ts')).toMatchObject({
    verb: 'resolve',
    args: ['game.ts'],
    flags: { theirs: true },
  });
  expect(completeSlash('/sta')).toContain('stash');
  expect(completeSlash('/res')).toContain('resolve');
});

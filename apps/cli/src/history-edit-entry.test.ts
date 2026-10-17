import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupHistoryFixtures, historyFixture, sourceLines } from '../test/history-edit-fixture.js';
import { parseArgv } from './argv.js';
import { runCli } from './main.js';
import { handleReplLine } from './repl.js';
import { printVersion } from './help.js';

afterEach(() => {
  cleanupHistoryFixtures();
  vi.unstubAllGlobals();
});
it.each(['checkout', 'restore', 'revert', 'blame'])(
  'treats --version as a value for %s and rejects missing values instead of printing CLI version',
  (verb) => {
    expect(parseArgv(['node', 'cli', verb, '--version', 'v1'])).toMatchObject({ verb, flags: { version: 'v1' } });
    const chunks: string[] = [];
    expect(printVersion({ version: true }, (text) => chunks.push(text), verb)).toBe(false);
    expect(chunks).toEqual([]);
    expect(printVersion({ V: true }, (text) => chunks.push(text), verb)).toBe(true);
  },
);
it('runs historical checkout through the actual entrypoint instead of downloading a new workspace', async () => {
  const f = historyFixture(),
    chunks: string[] = [];
  vi.stubGlobal('fetch', f.fetchFixture);
  const previous = process.cwd();
  process.chdir(f.root);
  try {
    const io = {
      stdin: { isTTY: false },
      stdout: {
        isTTY: false,
        write: (text: string) => {
          chunks.push(text);
          return true;
        },
      },
      stderr: {
        write: (text: string) => {
          chunks.push(text);
          return true;
        },
      },
    } as unknown as Parameters<typeof runCli>[2];
    expect(
      await runCli(['node', 'cli', 'checkout', '--version', 'v1', '--json'], { GAMEDEV_TOKEN: 'fixture' }, io),
    ).toBe(0);
    expect(JSON.parse(chunks.join('')).operation).toBe('restore');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(1, 1));
    expect(f.calls.some((path) => path.endsWith('/workspace'))).toBe(false);
  } finally {
    process.chdir(previous);
  }
});
it('runs restore and revert slash commands with the same local-only semantics', async () => {
  for (const line of ['/checkout --version v1', '/restore --version v1', '/revert v2']) {
    const f = historyFixture(),
      output: string[] = [];
    await handleReplLine({ line, api: f.api, token: null, cwd: f.root, write: (text) => output.push(text) });
    expect(output.join('')).toContain('Changes stay local');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(
      line.startsWith('/revert') ? sourceLines(1, 3) : sourceLines(1, 1),
    );
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
  }
});

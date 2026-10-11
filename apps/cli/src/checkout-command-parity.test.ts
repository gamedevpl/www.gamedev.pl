import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { runCli } from './main.js';
import { handleReplLine } from './repl.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { replStatus } from './repl-status.js';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(failRound = false) {
  const root = mkdtempSync(join(tmpdir(), 'checkout-status-'));
  roots.push(root);
  const files = [{ path: 'game.ts', content: 'const title = `old`;\n' }];
  writeGameFiles(root, 'example', files);
  writeBase(root, 'v1', files);
  writeFileSync(join(root, '.gamedev-slug'), 'example');
  const game = join(root, 'games', 'example');
  writeFileSync(join(game, 'game.ts'), 'const title = `new`;\n');
  vi.spyOn(process, 'cwd').mockReturnValue(game);
  const env = { GAMEDEV_TOKEN: 'test-token' };
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/api/submissions/round'))
      return new Response(JSON.stringify({ status: 'in_review', preview: { slug: 'example' } }), {
        status: failRound ? 503 : 200,
      });
    return new Response(
      JSON.stringify(
        url.endsWith('/versions')
          ? { versions: [{ version: 'v1', sourceFiles: ['game.ts'] }] }
          : { version: 'v1', files },
      ),
    );
  });
  vi.stubGlobal('fetch', fetch);
  const api = createApi({ origin: 'https://www.gamedev.pl', store: memoryStore(), env, fetch });
  return { api, env, root, game };
}

async function standalone(command: string[], env: NodeJS.ProcessEnv, tty = false) {
  const stdout = Object.assign(new PassThrough(), { isTTY: tty });
  let output = '';
  stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  const code = await runCli(['node', 'gamedevpl', ...command], env, {
    stdin: new PassThrough() as NodeJS.ReadStream,
    stdout: stdout as NodeJS.WriteStream,
    stderr: new PassThrough() as NodeJS.WriteStream,
  });
  expect(code).toBe(0);
  return output.trimEnd();
}

it('shows the identical working-copy status from a subdirectory, then supplements it with the round', async () => {
  const f = fixture();
  const output = await standalone(['status'], f.env);
  const lines: string[] = [];
  await handleReplLine({ line: '/status', api: f.api, token: 'round', cwd: f.game, write: (line) => lines.push(line) });
  expect(lines[0]).toBe(output);
  expect(lines[1]).toContain('Round status: in_review');
  expect(output).toContain('modified: game.ts');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('const title = `new`;\n');
});

it('keeps the local report visible when the round read fails or no round is connected', async () => {
  const f = fixture(true);
  const lines: string[] = [];
  await handleReplLine({ line: '/status', api: f.api, token: 'round', cwd: f.game, write: (line) => lines.push(line) });
  expect(lines[0]).toContain('modified: game.ts');
  expect(lines[1]).toContain('Round status unavailable:');
  const offline: string[] = [];
  await handleReplLine({ line: '/status', api: f.api, token: null, cwd: f.game, write: (line) => offline.push(line) });
  expect(offline).toEqual([lines[0]]);
});

it.each(['status', 'diff'])(
  'keeps interactive and standalone %s JSON reports identical and free of colors',
  async (command) => {
    const f = fixture();
    const output = await standalone([command, '--json'], f.env, true);
    const lines: string[] = [];
    await handleReplLine({
      line: `/${command} --json`,
      api: f.api,
      token: 'round',
      cwd: f.game,
      write: (line) => lines.push(line),
    });
    expect(lines).toEqual([output]);
    expect(JSON.parse(output).local).toEqual(['game.ts']);
    expect(output).not.toContain('\u001b');
  },
);

it('uses the same diff, adds terminal colors, and respects NO_COLOR', async () => {
  const f = fixture();
  const output = await standalone(['diff'], f.env);
  const lines: string[] = [];
  await handleReplLine({ line: '/diff', api: f.api, token: 'round', cwd: f.game, write: (line) => lines.push(line) });
  expect(lines).toEqual([output]);
  expect(await standalone(['diff'], f.env, true)).toContain('\u001b[32m+const title = `new`;\u001b[0m');
  expect(await standalone(['diff'], { ...f.env, NO_COLOR: '1' }, true)).toBe(output);
});

it('keeps an explicit round token separate from the current checkout', async () => {
  const f = fixture();
  const lines: string[] = [];
  await handleReplLine({
    line: '/status round',
    api: f.api,
    token: null,
    cwd: f.game,
    write: (line) => lines.push(line),
  });
  expect(lines.join('\n')).toContain('in_review');
  expect(lines.join('\n')).not.toContain('Working copy:');
});

it('follows the active workshop when the launch directory belongs to another game', async () => {
  const f = fixture();
  const other = mkdtempSync(join(tmpdir(), 'other-checkout-'));
  roots.push(other);
  writeFileSync(join(other, '.gamedev-slug'), 'another-game');
  const lines: string[] = [];
  await replStatus(
    {
      api: f.api,
      token: null,
      cwd: other,
      workshop: { root: f.root, slug: 'example', token: 'round' },
      write: (line) => lines.push(line),
    },
    [],
  );
  expect(lines[0]).toContain('Working copy: example');
  expect(lines[1]).toContain('Round status: in_review');
});

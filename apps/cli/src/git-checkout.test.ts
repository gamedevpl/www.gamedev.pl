import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { gitFixture } from '../test/git-checkout-fixture.js';
import { checkoutGit } from './git-checkout-layout.js';
import { checkoutGame, localGameFiles } from './checkout.js';
import { handleReplLine } from './repl.js';
import { runCli } from './main.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  cleanupHistoryFixtures();
});

describe.each([false, true])('optional Git, source repository=%s', (project) => {
  it('initializes platform history and index without changing source bytes or synchronization metadata', async () => {
    const f = gitFixture(project),
      before = localGameFiles(f.root, 'probe');
    const result = await f.setup();
    expect(result.initialized).toBe(true);
    expect(f.git('log', '--format=%s')).toBe('v3\nv2\nv1');
    expect(f.git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/main');
    expect(f.git('status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(localGameFiles(f.root, 'probe')).toEqual(before);
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
    const content = f.bytes(['show', `HEAD:${f.prefix}/images/test.png`]);
    expect(content).toEqual(
      project ? Buffer.from([0, 255, 2]) : Buffer.from(Buffer.from([0, 255, 2]).toString('base64')),
    );
    expect(f.git('check-ignore', '.gamedev-base.json')).toBe('.gamedev-base.json');
    const second = await f.setup();
    expect(second.initialized).toBe(false);
    expect(f.git('log', '--format=%s')).toBe('v3\nv2\nv1');
    expect(f.calls.filter((url) => url.endsWith('/tree'))).toHaveLength(3);
  });
  it('preserves existing commits, staged changes, drafts and origin when adding a platform remote', async () => {
    const f = gitFixture(project);
    f.git('init', '--initial-branch=main', '--template=');
    f.git('remote', 'add', 'origin', 'https://example.invalid/creator/game.git');
    f.git('add', `${f.prefix}/game.ts`);
    f.commit('local history');
    writeFileSync(join(f.game, 'game.ts'), 'staged draft\n');
    f.git('add', `${f.prefix}/game.ts`);
    writeFileSync(join(f.game, 'game.ts'), 'unstaged draft\n');
    const head = f.git('rev-parse', 'HEAD'),
      index = f.bytes(['show', `:${f.prefix}/game.ts`]);
    const result = await f.setup();
    expect(result.remote).toBe('gamedevpl');
    expect(result.initialized).toBe(false);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.bytes(['show', `:${f.prefix}/game.ts`])).toEqual(index);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('unstaged draft\n');
    expect(f.git('remote', 'get-url', 'origin')).toBe('https://example.invalid/creator/game.git');
    expect(f.git('log', 'gamedevpl/main', '--format=%s')).toBe('v3\nv2\nv1');
  });
});
it('supports stash without removing the local Creator Kit or hiding a source draft', async () => {
  const f = gitFixture();
  writeFileSync(join(f.root, 'setup.mjs'), 'local Creator Kit\n');
  await f.setup();
  writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
  writeFileSync(join(f.game, 'draft.ts'), 'new local file\n');
  f.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'stash', 'push', '-u');
  expect(readFileSync(join(f.root, 'setup.mjs'), 'utf8')).toBe('local Creator Kit\n');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
  expect(existsSync(join(f.game, 'draft.ts'))).toBe(false);
  f.git('stash', 'pop');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
  expect(readFileSync(join(f.game, 'draft.ts'), 'utf8')).toBe('new local file\n');
});
it('preserves staged files in an unborn repository and refuses an occupied remote', async () => {
  const f = gitFixture();
  f.git('init', '--initial-branch=main', '--template=');
  f.git('add', `${f.prefix}/game.ts`);
  await expect(f.setup()).rejects.toThrow('existing index');
  expect(f.git('show', `:${f.prefix}/game.ts`)).toBe(sourceLines(2, 3).trim());
  f.commit('local');
  f.git('remote', 'add', 'gamedevpl', 'https://example.invalid/other.git');
  await expect(f.setup()).rejects.toThrow('already points elsewhere');
  expect(f.calls).toEqual([]);
});
it('uses the checkout base for a new local branch when the platform is ahead', async () => {
  const f = gitFixture();
  f.versions.unshift({ ...f.versions[0]!, version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
  f.trees.v4 = f.trees.v3!.map((file) => (file.path === 'game.ts' ? { ...file, content: sourceLines(8, 3) } : file));
  await f.setup();
  expect(f.git('log', '-1', '--format=%s')).toBe('v3');
  expect(f.git('log', '-1', 'origin/main', '--format=%s')).toBe('v4');
  expect(f.git('status', '--porcelain', '--untracked-files=no')).toBe('');
});
it('refuses missing Git before network calls and keeps native files usable', async () => {
  const f = gitFixture();
  vi.stubEnv('PATH', '');
  await expect(f.setup()).rejects.toThrow('requires Git on PATH');
  expect(f.calls).toEqual([]);
  expect(existsSync(join(f.root, '.git'))).toBe(false);
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
});
it.each([false, true])('downloads a checkout with explicit Git opt-in=%s', async (git) => {
  const f = gitFixture(),
    dest = join(f.root, 'download');
  await checkoutGame({
    api: f.api,
    slug: 'probe',
    dest,
    git,
    fetchBuffer: async () => Buffer.from('fixture archive'),
    run: (command) => {
      expect(command).toBe('tar');
    },
  });
  expect(existsSync(join(dest, '.git'))).toBe(git);
  expect(readFileSync(join(dest, 'games/probe/game.ts'), 'utf8')).toBe(sourceLines(2, 3));
  if (git) expect(checkoutGit(dest)(['log', '--format=%s']).toString().trim()).toBe('v3\nv2\nv1');
});
it.each(['shell', 'slash'])('opts into Git through the %s command entrypoint', async (entry) => {
  const f = gitFixture(),
    output: string[] = [];
  if (entry === 'shell') {
    vi.stubGlobal('fetch', f.fetchFixture);
    vi.spyOn(process, 'cwd').mockReturnValue(f.root);
    const stdout = new PassThrough();
    stdout.on('data', (chunk) => output.push(String(chunk)));
    expect(
      await runCli(
        ['node', 'cli', 'git', 'init', '--json'],
        { GAMEDEV_TOKEN: 'fixture' },
        {
          stdin: new PassThrough() as NodeJS.ReadStream,
          stdout: stdout as NodeJS.WriteStream,
          stderr: stdout as NodeJS.WriteStream,
        },
      ),
    ).toBe(0);
    expect(JSON.parse(output.join('')).initialized).toBe(true);
  } else {
    await handleReplLine({
      line: '/git init',
      api: f.api,
      token: null,
      cwd: f.root,
      write: (text) => output.push(text),
    });
    expect(output.join('')).toContain('Git connected');
  }
  expect(f.git('log', '--format=%s')).toBe('v3\nv2\nv1');
});
it('initializes SHA-256 history without assuming a SHA-1 null parent', async () => {
  const f = gitFixture();
  f.git('init', '--initial-branch=main', '--object-format=sha256', '--template=');
  await f.setup();
  expect(f.git('rev-parse', 'HEAD')).toHaveLength(64);
  expect(f.git('log', '--format=%s')).toBe('v3\nv2\nv1');
});

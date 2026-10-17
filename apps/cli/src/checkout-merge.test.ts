import { PassThrough } from 'node:stream';
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupHistoryFixtures, historyFixture, sourceLines } from '../test/history-edit-fixture.js';
import { pullGame, readBase, writeGameFiles } from './checkout.js';
import { hashesOf } from './checkout-sync.js';
import { handleReplLine } from './repl.js';
import { runCli } from './main.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  cleanupHistoryFixtures();
});
function fixture(project = false) {
  const f = historyFixture(project);
  f.trees.v4 = f.trees.v3!.map((file) => ({ ...file }));
  f.trees.v4.find((file) => file.path === 'game.ts')!.content = sourceLines(2, 8);
  f.versions.unshift({
    ...f.versions[0]!,
    version: 'v4',
    createdAt: '2026-10-04T00:00:00Z',
    sourceFiles: f.trees.v4.map((file) => file.path),
  });
  writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
  const pull = () => pullGame({ api: f.api, slug: 'probe', dest: f.root });
  const putRemote = (path: string, content: string) => {
    f.trees.v4!.push({ path, content });
    f.versions[0]!.sourceFiles.push(path);
  };
  return { ...f, pull, putRemote };
}
function unchanged(f: ReturnType<typeof fixture>) {
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
  expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
  expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
  expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
}

describe.each([false, true])('pull merge, source repository=%s', (project) => {
  it('merges independent edits, handles additions/deletions, and records the remote rather than merged base', async () => {
    const f = fixture(project);
    f.putRemote('remote.ts', 'incoming\n');
    f.trees.v4 = f.trees.v4!.filter((file) => file.path !== 'later.ts');
    f.versions[0]!.sourceFiles = f.trees.v4.map((file) => file.path);
    f.trees.v4.find((file) => file.path === 'images/test.png')!.content = Buffer.from([0, 255, 4]).toString('base64');
    rmSync(join(f.game, 'added.ts'));
    writeFileSync(join(f.game, 'local.ts'), 'draft\n');
    const result = await f.pull();
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
    expect(readFileSync(join(f.game, 'remote.ts'), 'utf8')).toBe('incoming\n');
    expect(readFileSync(join(f.game, 'local.ts'), 'utf8')).toBe('draft\n');
    expect(existsSync(join(f.game, 'added.ts'))).toBe(false);
    expect(existsSync(join(f.game, 'later.ts'))).toBe(false);
    expect(readFileSync(join(f.game, 'cache.ts'), 'utf8')).toBe('ignored code\n');
    expect(readFileSync(join(f.game, 'notes.txt'), 'utf8')).toBe('private notes\n');
    expect(existsSync(join(f.game, 'media/empty'))).toBe(true);
    expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
      project ? Buffer.from([0, 255, 4]) : Buffer.from(Buffer.from([0, 255, 4]).toString('base64')),
    );
    expect(result.notices).toContain('Auto-merged: game.ts');
    expect(result.kept).toEqual(['added.ts', 'game.ts', 'local.ts']);
    expect(result.sync.kind).toBe('local_only');
    expect(readBase(f.root)).toMatchObject({ version: 'v4', files: hashesOf(f.trees.v4!) });
    const second = await f.pull();
    expect(second.sync.kind).toBe('local_only');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
    expect(f.calls.filter((path) => path.endsWith('/v3/tree'))).toHaveLength(1);
    expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
  });
  it('leaves all sources and the base untouched on overlapping edits', async () => {
    const f = fixture(project);
    f.trees.v4!.find((file) => file.path === 'game.ts')!.content = sourceLines(8, 3);
    f.putRemote('remote.ts', 'should not land\n');
    await expect(f.pull()).rejects.toThrow('Conflict on game.ts');
    unchanged(f);
    expect(existsSync(join(f.game, 'remote.ts'))).toBe(false);
  });
  it('refuses conflicting binary changes without producing text conflict markers', async () => {
    const f = fixture(project);
    f.trees.v4!.find((file) => file.path === 'images/test.png')!.content = Buffer.from([0, 255, 8]).toString('base64');
    writeGameFiles(
      f.root,
      'probe',
      f.trees.v3!.map((file) =>
        file.path === 'images/test.png' ? { ...file, content: Buffer.from([0, 255, 9]).toString('base64') } : file,
      ),
    );
    writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
    await expect(f.pull()).rejects.toThrow('Binary conflict');
    unchanged(f);
    expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
      project ? Buffer.from([0, 255, 9]) : Buffer.from(Buffer.from([0, 255, 9]).toString('base64')),
    );
  });
});

it.each(['add/add', 'modify/delete'])('refuses %s before writing any successfully merged file', async (kind) => {
  const f = fixture();
  if (kind === 'add/add') {
    f.putRemote('new.ts', 'remote\n');
    writeFileSync(join(f.game, 'new.ts'), 'local\n');
  } else {
    f.trees.v4 = f.trees.v4!.filter((file) => file.path !== 'later.ts');
    f.versions[0]!.sourceFiles = f.trees.v4.map((file) => file.path);
    writeFileSync(join(f.game, 'later.ts'), 'modified\n');
  }
  await expect(f.pull()).rejects.toThrow('Add/delete conflict');
  unchanged(f);
});
it('refuses an unavailable or mismatched historical base', async () => {
  const f = fixture();
  const original = f.trees.v3!;
  delete f.trees.v3;
  await expect(f.pull()).rejects.toThrow('Cannot merge conflict');
  unchanged(f);
  f.trees.v3 = original.map((file) => (file.path === 'game.ts' ? { ...file, content: 'wrong base\n' } : file));
  await expect(f.pull()).rejects.toThrow('hashes do not match');
  unchanged(f);
});
it.each(['editor', 'metadata', 'platform'])('preserves concurrent %s changes during base fetching', async (kind) => {
  const f = fixture();
  let changed = false;
  f.control.onRequest = (url) => {
    if (changed || !url.pathname.endsWith('/v3/tree')) return;
    changed = true;
    if (kind === 'editor') writeFileSync(join(f.game, 'game.ts'), 'concurrent editor\n');
    else if (kind === 'metadata') writeFileSync(join(f.root, '.gitignore'), '*.ts\n');
    else f.versions.unshift({ ...f.versions[0]!, version: 'v5' });
  };
  await expect(f.pull()).rejects.toThrow(/changed during pull/);
  if (kind === 'editor') expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('concurrent editor\n');
  else unchanged(f);
  expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
});
it('refuses source symlinks and preserves their external target', async () => {
  const f = fixture();
  symlinkSync(join(f.root, '.git/index'), join(f.game, 'link.ts'));
  await expect(f.pull()).rejects.toThrow('symbolic links');
  unchanged(f);
});
it('requires Git for overlapping files and ignores caller Git environment during a successful merge', async () => {
  const f = fixture();
  vi.stubEnv('PATH', '');
  await expect(f.pull()).rejects.toThrow('requires Git on PATH');
  unchanged(f);
  vi.unstubAllEnvs();
  vi.stubEnv('GIT_DIR', join(f.root, '.git'));
  await f.pull();
  expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
  expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
});
it('refuses a merged source-repository SPEC that changes the bound game', async () => {
  const f = fixture(true);
  f.trees.v4!.find((file) => file.path === 'SPEC.md')!.content = '---\nslug: other\n---\n';
  await expect(f.pull()).rejects.toThrow('game identity');
  unchanged(f);
});
it.each(['shell', 'slash'])('runs the merge through the %s entrypoint', async (entry) => {
  const f = fixture();
  const output: string[] = [];
  if (entry === 'shell') {
    vi.stubGlobal('fetch', f.fetchFixture);
    vi.spyOn(process, 'cwd').mockReturnValue(f.root);
    const stdout = new PassThrough();
    stdout.on('data', (chunk) => output.push(String(chunk)));
    expect(
      await runCli(
        ['node', 'cli', 'pull'],
        { GAMEDEV_TOKEN: 'fixture' },
        {
          stdin: new PassThrough() as NodeJS.ReadStream,
          stdout: stdout as NodeJS.WriteStream,
          stderr: stdout as NodeJS.WriteStream,
        },
      ),
    ).toBe(0);
  } else
    await handleReplLine({ line: '/pull', api: f.api, token: null, cwd: f.root, write: (text) => output.push(text) });
  expect(output.join('')).toContain('Auto-merged: game.ts');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
  expect(f.calls.every((path) => path.includes('/versions'))).toBe(true);
});

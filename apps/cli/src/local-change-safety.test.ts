import { afterEach, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { readLocalOperation } from './local-operation.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { OPERATION_FILE, writeLocalJson } from './local-change-store.js';
import { sourceSnapshot } from './history-edit-files.js';
import { reconcilePush } from './git-remote-main.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  cleanupHistoryFixtures();
});
it.each([false, true])('resolves binary conflicts without text markers, source repository=%s', async (project) => {
  const f = localChangesFixture(project);
  f.draft();
  f.advance();
  const binary = Buffer.from([0, 255, 8]).toString('base64');
  f.trees.v4!.find((file) => file.path === 'images/test.png')!.content = binary;
  writeGameFiles(
    f.root,
    'probe',
    f.trees.v3!.map((file) =>
      file.path === 'images/test.png' ? { ...file, content: Buffer.from([0, 255, 9]).toString('base64') } : file,
    ),
  );
  f.draft();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  expect(readLocalOperation(f.root)?.conflicts).toContainEqual({
    paths: ['images/test.png'],
    kind: 'binary',
    resolved: false,
  });
  await f.resolve(['game.ts'], { ours: true });
  await f.resolve(['images/test.png'], { theirs: true });
  await f.resolve([], { continue: true });
  expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
    project ? Buffer.from([0, 255, 8]) : Buffer.from(binary),
  );
});
it.each(['add/add', 'modify/delete', 'case collision'])('can choose the incoming side of %s', async (kind) => {
  const f = localChangesFixture();
  f.advance(sourceLines(2, 3));
  if (kind === 'add/add') {
    f.trees.v4!.push({ path: 'new.ts', content: 'incoming\n' });
    writeFileSync(join(f.game, 'new.ts'), 'ours\n');
  } else if (kind === 'modify/delete') {
    f.trees.v4 = f.trees.v4!.filter((file) => file.path !== 'later.ts');
    writeFileSync(join(f.game, 'later.ts'), 'ours\n');
  } else {
    f.trees.v4 = f.trees.v4!.filter((file) => file.path !== 'images/test.png');
    f.trees.v4.push({
      path: 'images/Test.png',
      content: Buffer.from([0, 255, 7]).toString('base64'),
      encoding: 'base64',
    });
    writeFileSync(join(f.game, 'images/test.png'), Buffer.from([0, 255, 9]).toString('base64'));
  }
  f.versions[0]!.sourceFiles = f.trees.v4!.map((file) => file.path);
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  const conflict = readLocalOperation(f.root)!.conflicts[0]!;
  await f.resolve([conflict.paths[0]!], { theirs: true });
  await f.resolve([], { continue: true });
  if (kind === 'add/add') expect(readFileSync(join(f.game, 'new.ts'), 'utf8')).toBe('incoming\n');
  if (kind === 'case collision')
    expect(readFileSync(join(f.game, 'images/Test.png'), 'utf8')).toBe(Buffer.from([0, 255, 7]).toString('base64'));
  expect(readLocalOperation(f.root)).toBeNull();
});
it('preserves an ignored collision and retains the stash when applying fails', async () => {
  const f = localChangesFixture();
  writeFileSync(join(f.game, 'draft.ts'), 'saved draft');
  await f.stash();
  writeFileSync(join(f.root, '.gitignore'), 'games/probe/draft.ts\n');
  writeFileSync(join(f.game, 'draft.ts'), 'ignored later draft');
  await expect(f.stash(['pop'])).rejects.toThrow('Unignore the incoming source');
  expect(readFileSync(join(f.game, 'draft.ts'), 'utf8')).toBe('ignored later draft');
  expect(await f.stash(['list'])).toMatchObject({ stashes: [expect.any(Object)] });
});
it('refuses source and metadata symlinks without changing their targets', async () => {
  const f = localChangesFixture();
  f.draft();
  const external = join(f.root, 'outside.ts');
  writeFileSync(external, 'untouched');
  symlinkSync(external, join(f.game, 'link.ts'));
  await expect(f.stash()).rejects.toThrow('symbolic');
  rmSync(join(f.game, 'link.ts'));
  mkdirSync(join(f.root, '.gamedev'), { recursive: true });
  symlinkSync(external, join(f.root, '.gamedev/merge.json'));
  await expect(f.resolve()).rejects.toThrow('symbolic');
  expect(readFileSync(external, 'utf8')).toBe('untouched');
});
it('refuses stale source captures and preserves edits made during the base request', async () => {
  const f = localChangesFixture();
  f.draft();
  f.control.onRequest = (url) => {
    if (url.pathname.endsWith('/v3/tree')) f.draft('edited during request');
  };
  await expect(f.stash()).rejects.toThrow('Sources changed');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('edited during request');
  expect(await f.stash(['list'])).toEqual({ stashes: [] });
});
it('stashes an undelivered draft without network or Git', async () => {
  const f = localChangesFixture();
  writeBase(f.root, 'undelivered', []);
  vi.stubEnv('PATH', '');
  await f.stash();
  expect(f.calls).toEqual([]);
  await f.stash(['pop']);
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
});
it('recovers interrupted merge setup through abort', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  const digest = sourceSnapshot(f.game).digest;
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  const state = readLocalOperation(f.root)!;
  state.phase = 'preparing';
  writeLocalJson(f.root, OPERATION_FILE, state);
  await expect(f.resolve([], { continue: true })).rejects.toThrow('setup was interrupted');
  await f.resolve([], { abort: true });
  expect(sourceSnapshot(f.game).digest).toBe(digest);
});
it('requires the original game context and leaves changed ignore rules intact', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  writeFileSync(join(f.root, '.gitignore'), 'changed rules\n');
  await expect(f.resolve(['game.ts'], { ours: true })).rejects.toThrow('identity, ignore rules');
  expect(readFileSync(join(f.root, '.gitignore'), 'utf8')).toBe('changed rules\n');
});
it('blocks the Git helper before delivery while a native merge is pending', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  const calls = f.calls.length;
  expect(await reconcilePush({ api: f.api, cwd: f.root, slug: 'probe', srcRef: 'HEAD' })).toMatchObject({
    ok: false,
    message: expect.stringContaining('merge is pending'),
  });
  expect(f.calls.length).toBe(calls);
});

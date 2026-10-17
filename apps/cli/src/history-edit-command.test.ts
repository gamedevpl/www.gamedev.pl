import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupHistoryFixtures, historyFixture, sourceLines } from '../test/history-edit-fixture.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { withCheckoutWriter } from './workbench-lock.js';

afterEach(cleanupHistoryFixtures);
function preserved(f: ReturnType<typeof historyFixture>) {
  expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
  expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
  expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
  expect(readFileSync(join(f.game, 'cache.ts'), 'utf8')).toBe('ignored code\n');
  expect(readFileSync(join(f.game, 'notes.txt'), 'utf8')).toBe('private notes\n');
  if (process.platform !== 'win32') expect(lstatSync(join(f.game, 'notes.txt')).mode & 0o777).toBe(0o751);
  expect(existsSync(join(f.game, 'media/empty'))).toBe(true);
}

describe.each([false, true])('local history edits, source repository=%s', (project) => {
  it('restores an entire historical tree, retaining ignored files, base and caller Git state', async () => {
    const f = historyFixture(project),
      result = await f.run();
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(1, 1));
    expect(readFileSync(join(f.game, 'deleted.ts'), 'utf8')).toBe('restore this\n');
    expect(existsSync(join(f.game, 'added.ts'))).toBe(false);
    expect(existsSync(join(f.game, 'later.ts'))).toBe(false);
    expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
      project ? Buffer.from([0, 255, 1]) : Buffer.from(Buffer.from([0, 255, 1]).toString('base64')),
    );
    expect(result.changed.deleted).toEqual(['added.ts', 'later.ts']);
    expect(readFileSync(join(result.backup!, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    expect(f.calls.every((path) => path.includes('/versions'))).toBe(true);
    preserved(f);
  });
  it('reverts only the chosen delivery, preserving later edits to the same file', async () => {
    const f = historyFixture(project),
      result = await f.run('revert', ['v2']);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(1, 3));
    expect(readFileSync(join(f.game, 'later.ts'), 'utf8')).toBe('keep later\n');
    expect(existsSync(join(f.game, 'added.ts'))).toBe(false);
    expect(readFileSync(join(result.backup!, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    preserved(f);
  });
  it('plans without writing, and reports no-op restores without creating backups', async () => {
    const f = historyFixture(project),
      result = await f.run('restore', ['v1'], { 'dry-run': true });
    expect(result.dryRun).toBe(true);
    expect(result.backup).toBeNull();
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    expect(existsSync(join(f.root, '.gamedev/history-backups'))).toBe(false);
    expect((await f.run('restore', ['v3'])).backup).toBeNull();
    preserved(f);
  });
  it('refuses dirty sources by default and preserves them in a forced restore backup', async () => {
    const f = historyFixture(project);
    writeFileSync(join(f.game, 'game.ts'), 'local draft\n');
    await expect(f.run()).rejects.toThrow('Local source edits');
    expect(f.calls).toEqual([]);
    await expect(f.run('revert', ['v2'])).rejects.toThrow('Local source edits');
    const result = await f.run('restore', ['v1'], { force: true });
    expect(readFileSync(join(result.backup!, 'game.ts'), 'utf8')).toBe('local draft\n');
    preserved(f);
  });
  it('refuses overlapping reverse changes without leaving conflict markers or source writes', async () => {
    const f = historyFixture(project);
    f.trees.v3!.find((file) => file.path === 'game.ts')!.content = sourceLines(3, 3);
    writeGameFiles(f.root, 'probe', f.trees.v3!);
    writeBase(f.root, 'v3', f.trees.v3!);
    const before = readFileSync(join(f.game, 'game.ts'));
    await expect(f.run('revert', ['v2'])).rejects.toThrow('conflict');
    expect(readFileSync(join(f.game, 'game.ts'))).toEqual(before);
    expect(existsSync(join(f.root, '.gamedev/history-backups'))).toBe(false);
  });
});

it('rejects stale bases, unknown versions and incomplete trees without changing source files', async () => {
  const f = historyFixture();
  await expect(f.run('restore', ['missing'])).rejects.toThrow('Version not found');
  f.control.treeResponse = (version, files) => (version === 'v1' ? files.slice(1) : files);
  await expect(f.run()).rejects.toThrow('Incomplete');
  f.control.treeResponse = undefined;
  writeGameFiles(f.root, 'probe', f.trees.v2!);
  writeBase(f.root, 'v2', f.trees.v2!);
  await expect(f.run()).rejects.toThrow('platform has moved');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 1));
});
it('preserves concurrent editor changes and refuses changed metadata after history fetching', async () => {
  const f = historyFixture();
  let changed = false;
  f.control.onRequest = (url) => {
    if (!changed && url.pathname.endsWith('/tree')) {
      changed = true;
      writeFileSync(join(f.game, 'game.ts'), 'concurrent editor\n');
    }
  };
  await expect(f.run()).rejects.toThrow('changed during');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('concurrent editor\n');
  expect(existsSync(join(f.root, '.gamedev/history-pending.json'))).toBe(false);
  preserved(f);
});
it.each(['restore', 'revert'])('refuses %s if a delivery lands while historical trees are fetched', async (verb) => {
  const f = historyFixture();
  let changed = false;
  f.control.onRequest = (url) => {
    if (!changed && url.pathname.endsWith('/tree')) {
      changed = true;
      f.versions.unshift({ ...f.versions[0]!, version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
    }
  };
  await expect(f.run(verb, [verb === 'restore' ? 'v1' : 'v2'])).rejects.toThrow('platform changed during');
  expect(f.calls.filter((path) => path.endsWith('/versions?limit=1'))).toHaveLength(1);
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
  expect(existsSync(join(f.root, '.gamedev/history-backups'))).toBe(false);
  preserved(f);
});
it('refuses mismatched game identity and historical SPEC identity changes', async () => {
  const f = historyFixture(true);
  await expect(f.run('restore', ['v1'], { slug: 'other' })).rejects.toThrow('does not match');
  f.trees.v1!.find((file) => file.path === 'SPEC.md')!.content = '---\nslug: other\n---\n';
  await expect(f.run()).rejects.toThrow('game identity');
  preserved(f);
});
it('refuses overwriting ignored files even when force was selected', async () => {
  const f = historyFixture();
  f.trees.v1!.push({ path: 'cache.ts', content: 'remote cache' });
  f.versions.find((row) => row.version === 'v1')!.sourceFiles.push('cache.ts');
  await expect(f.run('restore', ['v1'], { force: true })).rejects.toThrow('ignored');
  preserved(f);
});
it.skipIf(process.platform === 'win32')('refuses source and ancestor symlinks without following them', async () => {
  const f = historyFixture();
  symlinkSync(join(f.root, '.git/index'), join(f.game, 'ignored-link'));
  await expect(f.run('restore', ['v1'], { force: true })).rejects.toThrow('symbolic');
  expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
  rmSync(join(f.game, 'ignored-link'));
  symlinkSync(f.game, join(f.root, 'alias'));
  rmSync(join(f.game, 'images/test.png'));
  symlinkSync(join(f.root, '.git/index'), join(f.game, 'images/test.png'));
  await expect(f.run()).rejects.toThrow('symbolic');
});
it('uses the checkout writer lock and refuses invalid flags before touching sources', async () => {
  const f = historyFixture();
  let release!: () => void;
  const held = withCheckoutWriter(
    f.root,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  try {
    await expect(f.run()).rejects.toThrow('owns this checkout');
  } finally {
    release();
    await held;
  }
  await expect(f.run('revert', ['v2'], { force: true })).rejects.toThrow('does not discard');
  await expect(f.run('restore', [], { version: true })).rejects.toThrow('usage');
  await expect(f.run('restore', ['v1'], { unknown: true })).rejects.toThrow('Unknown');
  expect(f.calls).toEqual([]);
  preserved(f);
});

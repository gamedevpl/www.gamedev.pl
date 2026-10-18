import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { readBase, writeGameFiles } from './checkout.js';
import { readLocalOperation } from './local-operation.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupHistoryFixtures();
});
describe.each([false, true])('native stash, source repository=%s', (project) => {
  it('saves edits, additions, deletion and raster bytes, then pops without a repository or publication', async () => {
    const f = localChangesFixture(project);
    f.draft();
    writeFileSync(join(f.game, 'new.ts'), 'new draft\n');
    rmSync(join(f.game, 'added.ts'));
    writeGameFiles(f.root, 'probe', [
      ...f.trees.v3!.filter((file) => !['game.ts', 'added.ts', 'images/test.png'].includes(file.path)),
      { path: 'game.ts', content: sourceLines(9, 3) },
      { path: 'new.ts', content: 'new draft\n' },
      { path: 'images/test.png', content: Buffer.from([0, 255, 7]).toString('base64') },
    ]);
    const saved = await f.stash(['push'], { message: 'before experimenting' });
    expect(saved).toMatchObject({ saved: true, stash: { message: 'before experimenting' } });
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    expect(existsSync(join(f.game, 'new.ts'))).toBe(false);
    expect(readFileSync(join(f.game, 'added.ts'), 'utf8')).toBe('remove this\n');
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
    const calls = f.calls.length;
    expect(await f.stash(['list'])).toMatchObject({
      stashes: [{ ref: 'stash@{0}', changes: expect.arrayContaining([{ path: 'new.ts', kind: 'added' }]) }],
    });
    await f.stash(['pop']);
    expect(f.calls.length).toBe(calls);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
    expect(existsSync(join(f.game, 'added.ts'))).toBe(false);
    expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
      project ? Buffer.from([0, 255, 7]) : Buffer.from(Buffer.from([0, 255, 7]).toString('base64')),
    );
    expect(await f.stash(['list'])).toEqual({ stashes: [] });
    expect(existsSync(join(f.root, '.git'))).toBe(false);
    expect(readFileSync(join(f.game, 'cache.ts'), 'utf8')).toBe('ignored code\n');
    expect(readFileSync(join(f.game, 'notes.txt'), 'utf8')).toBe('private notes\n');
    if (process.platform !== 'win32') expect(lstatSync(join(f.game, 'notes.txt')).mode & 0o777).toBe(0o751);
    expect(existsSync(join(f.game, 'media/empty'))).toBe(true);
    expect(f.calls.every((path) => path.includes('/versions'))).toBe(true);
  });
  it('merges a saved draft onto a newer platform base and preserves both edits', async () => {
    const f = localChangesFixture(project);
    f.draft();
    await f.stash();
    f.advance(sourceLines(2, 8));
    await f.pull();
    const base = readFileSync(join(f.root, '.gamedev-base.json'), 'utf8');
    await f.stash(['apply']);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(base);
    expect(readBase(f.root)?.version).toBe('v4');
    expect(await f.stash(['list'])).toMatchObject({ stashes: [expect.any(Object)] });
  });
  it('retains a conflicting pop until resolution, including across restart, and never advances the base', async () => {
    const f = localChangesFixture(project);
    f.draft();
    await f.stash();
    f.advance();
    await f.pull();
    const base = readFileSync(join(f.root, '.gamedev-base.json'), 'utf8');
    await expect(f.stash(['pop'])).rejects.toThrow('Stash conflicts');
    expect(readLocalOperation(f.root)).toMatchObject({
      kind: 'stash',
      conflicts: [{ paths: ['game.ts'], resolved: false }],
    });
    expect(await f.stash(['list'])).toMatchObject({ stashes: [expect.any(Object)] });
    await expect(f.stash(['continue'])).rejects.toThrow('Unresolved');
    await f.resolve(['game.ts'], { theirs: true });
    await f.stash(['continue']);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(base);
    expect(await f.stash(['list'])).toEqual({ stashes: [] });
    expect(readLocalOperation(f.root)).toBeNull();
  });
  it('aborts a conflicting pop without dropping the stash or discarding later resolution edits', async () => {
    const f = localChangesFixture(project);
    f.draft();
    await f.stash();
    f.advance();
    await f.pull();
    await expect(f.stash(['pop'])).rejects.toThrow('Stash conflicts');
    f.draft('edits while resolving\n');
    const result = await f.stash(['abort']);
    expect(result).toMatchObject({ aborted: true });
    expect(readFileSync(join((result as { backup: string }).backup, 'game.ts'), 'utf8')).toBe(
      'edits while resolving\n',
    );
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(8, 3));
    expect(await f.stash(['list'])).toMatchObject({ stashes: [expect.any(Object)] });
  });
});
it('refuses a mismatched historical base and keeps all drafts unchanged', async () => {
  const f = localChangesFixture();
  f.draft();
  f.trees.v3!.find((file) => file.path === 'game.ts')!.content = 'wrong historical bytes';
  await expect(f.stash()).rejects.toThrow('do not match');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 3));
  expect(await f.stash(['list'])).toEqual({ stashes: [] });
});
it('keeps caller Git HEAD and index unchanged through stash and pop', async () => {
  const f = localChangesFixture(false, true);
  f.draft();
  await f.stash();
  await f.stash(['pop']);
  expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
  expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
});
it('supports show and drop by stable id, and rejects malformed stash refs', async () => {
  const f = localChangesFixture();
  f.draft();
  await f.stash(['push'], { message: 'first' });
  const list = (await f.stash(['list'])) as { stashes: { id: string }[] };
  const id = list.stashes[0]!.id;
  expect(await f.stash(['show', id])).toMatchObject({
    stash: { id, message: 'first', changes: [{ path: 'game.ts', kind: 'modified' }] },
  });
  await expect(f.stash(['show', 'stash@{0'])).rejects.toThrow('not found');
  await f.stash(['drop', id]);
  expect(await f.stash(['list'])).toEqual({ stashes: [] });
});
it('does not treat marker-shaped source content as generated stash conflicts', async () => {
  const f = localChangesFixture();
  const content = '<<<<<<< example\n||||||| base\n>>>>>>> example\n';
  writeFileSync(join(f.game, 'example.ts'), content);
  await f.stash();
  await f.stash(['pop']);
  expect(readFileSync(join(f.game, 'example.ts'), 'utf8')).toBe(content);
  expect(readLocalOperation(f.root)).toBeNull();
});

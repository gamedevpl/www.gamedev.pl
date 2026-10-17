import { afterEach, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { cleanupHistoryFixtures, historyFixture, sourceLines } from '../test/history-edit-fixture.js';
import { historyIdentity, installHistorySources, prepareSources, sourceSnapshot } from './history-edit-files.js';

afterEach(cleanupHistoryFixtures);
function pending(f: ReturnType<typeof historyFixture>, backup: string, committed = false) {
  const id = basename(backup);
  writeFileSync(
    join(f.root, '.gamedev/history-pending.json'),
    JSON.stringify({ id, source: f.prefix, result: sourceSnapshot(f.game).digest, committed }),
  );
  return join(f.root, `.gamedev/history-stage-${id}`);
}

it('rolls back a failing source-directory replacement without partial changes', () => {
  const f = historyFixture(),
    before = sourceSnapshot(f.game);
  const after = prepareSources(before, new Set(['game.ts']), new Map([['game.ts', Buffer.from('replacement\n')]]));
  let moves = 0;
  expect(() =>
    installHistorySources({
      root: f.root,
      source: f.prefix,
      before,
      after,
      identity: historyIdentity(f.root),
      move: (from, to) => {
        if (++moves === 2) throw new Error('fixture rename failure');
        renameSync(from, to);
      },
    }),
  ).toThrow('fixture rename failure');
  expect(sourceSnapshot(f.game).digest).toBe(before.digest);
  expect(existsSync(join(f.root, '.gamedev/history-pending.json'))).toBe(false);
  expect(readdirSync(join(f.root, '.gamedev/history-backups'))).toEqual([]);
});

it.each([false, true])(
  'recovers an interruption with the source directory missing, source repository=%s',
  async (project) => {
    const f = historyFixture(project),
      result = await f.run();
    const stage = pending(f, result.backup!);
    renameSync(f.game, stage);
    expect((await f.run('restore', [], { recover: true })).recovered).toBe(true);
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    expect(existsSync(stage)).toBe(false);
    expect(existsSync(join(f.root, '.gamedev/history-pending.json'))).toBe(false);
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
  },
);

it('refuses recovery over new external edits and retains both copies', async () => {
  const f = historyFixture(),
    result = await f.run();
  pending(f, result.backup!);
  writeFileSync(join(f.game, 'game.ts'), 'new external draft\n');
  await expect(f.run('restore', [], { recover: true })).rejects.toThrow('changed after interruption');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('new external draft\n');
  expect(readFileSync(join(result.backup!, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
  expect(existsSync(join(f.root, '.gamedev/history-pending.json'))).toBe(true);
  await expect(f.run()).rejects.toThrow('needs recovery');
});

it('cleans committed recovery state without reverting subsequent edits', async () => {
  const f = historyFixture(),
    result = await f.run();
  pending(f, result.backup!, true);
  writeFileSync(join(f.game, 'game.ts'), 'post-commit draft\n');
  await f.run('restore', [], { recover: true });
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('post-commit draft\n');
  expect(existsSync(result.backup!)).toBe(true);
});

it('rejects recovery journal namespace escapes and another game checkout', async () => {
  const f = historyFixture(),
    result = await f.run();
  for (const source of ['.git', '../outside', 'games/other']) {
    pending(f, result.backup!);
    const path = join(f.root, '.gamedev/history-pending.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), source }));
    await expect(f.run('restore', [], { recover: true })).rejects.toThrow(/Invalid|does not match/);
    expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
  }
});

it('refuses changed checkout metadata immediately before replacing sources', async () => {
  const f = historyFixture(),
    before = sourceSnapshot(f.game),
    identity = historyIdentity(f.root);
  const after = prepareSources(before, new Set(['game.ts']), new Map([['game.ts', Buffer.from('replacement\n')]]));
  writeFileSync(join(f.root, '.gitignore'), 'changed while fetching\n');
  expect(() => installHistorySources({ root: f.root, source: f.prefix, before, after, identity })).toThrow(
    'metadata changed',
  );
  expect(sourceSnapshot(f.game).digest).toBe(before.digest);
});

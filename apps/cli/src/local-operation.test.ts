import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { diffGame, pullGame, readBase } from './checkout.js';
import { readLocalOperation } from './local-operation.js';
import { submitGame } from './submit.js';
import { historyEditCommand } from './history-edit-command.js';
import { OPERATION_FILE, writeLocalJson } from './local-change-store.js';
import { sourceSnapshot } from './history-edit-files.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupHistoryFixtures();
});
describe.each([false, true])('native conflicts, source repository=%s', (project) => {
  it('leaves markers, preserves the base, blocks delivery/other writers, and completes after explicit resolution', async () => {
    const f = localChangesFixture(project);
    f.draft();
    f.advance();
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toContain('<<<<<<< local');
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
    const calls = f.calls.length;
    await expect(submitGame({ api: f.api, slug: 'probe', dest: f.root })).rejects.toThrow('merge is pending');
    await expect(pullGame({ api: f.api, slug: 'probe', dest: f.root, force: true })).rejects.toThrow(
      'merge is pending',
    );
    await expect(
      historyEditCommand({
        api: f.api,
        cwd: f.root,
        verb: 'restore',
        args: ['v1'],
        flags: { force: true },
        write: () => {},
      }),
    ).rejects.toThrow('merge is pending');
    expect(f.calls.length).toBe(calls);
    await expect(f.resolve(['game.ts'])).rejects.toThrow('markers');
    await f.resolve(['game.ts'], { theirs: true });
    const report = await diffGame({ api: f.api, slug: 'probe', dest: f.root });
    expect(report.operation).toMatchObject({ kind: 'pull', conflicts: [{ resolved: true }] });
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
    await f.resolve([], { continue: true });
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(8, 3));
    expect(readBase(f.root)?.version).toBe('v4');
    expect(readLocalOperation(f.root)).toBeNull();
    expect(existsSync(join(f.root, '.git'))).toBe(false);
  });
  it('supports a hand merge and retains nonconflicting incoming files', async () => {
    const f = localChangesFixture(project);
    f.draft();
    f.advance();
    f.trees.v4!.push({ path: 'remote.ts', content: 'incoming\n' });
    f.versions[0]!.sourceFiles.push('remote.ts');
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    f.draft('a hand merge\n');
    await f.resolve(['game.ts']);
    await f.resolve([], { continue: true });
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('a hand merge\n');
    expect(readFileSync(join(f.game, 'remote.ts'), 'utf8')).toBe('incoming\n');
    expect(readFileSync(join(f.game, 'cache.ts'), 'utf8')).toBe('ignored code\n');
  });
  it('aborts to the exact original source tree and preserves edits made during resolution', async () => {
    const f = localChangesFixture(project);
    f.draft();
    f.advance();
    const original = sourceSnapshot(f.game).digest;
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    f.draft('later edits\n');
    const result = (await f.resolve([], { abort: true })) as { backup: string };
    expect(sourceSnapshot(f.game).digest).toBe(original);
    expect(readFileSync(join(result.backup, 'game.ts'), 'utf8')).toBe('later edits\n');
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
  });
  it('does not advance to a platform version that arrived during resolution', async () => {
    const f = localChangesFixture(project);
    f.draft();
    f.advance();
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    await f.resolve(['game.ts'], { ours: true });
    f.versions.unshift({ ...f.versions[0]!, version: 'v5' });
    await expect(f.resolve([], { continue: true })).rejects.toThrow('platform moved');
    expect(readFileSync(join(f.root, '.gamedev-base.json'), 'utf8')).toBe(f.originalBase);
    await f.resolve([], { abort: true });
  });
});
it('resumes an interrupted base commit idempotently', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  await f.resolve(['game.ts'], { ours: true });
  const state = readLocalOperation(f.root)!;
  state.phase = 'committing';
  state.finalDigest = sourceSnapshot(f.game).digest;
  writeLocalJson(f.root, OPERATION_FILE, state);
  await f.resolve([], { continue: true });
  expect(readBase(f.root)?.version).toBe('v4');
});
it('finishes an already decided merge after a newer platform delivery arrives', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  await f.resolve(['game.ts'], { ours: true });
  const state = readLocalOperation(f.root)!;
  state.phase = 'committing';
  state.finalDigest = sourceSnapshot(f.game).digest;
  writeLocalJson(f.root, OPERATION_FILE, state);
  f.versions.unshift({ ...f.versions[0]!, version: 'v5' });
  const calls = f.calls.length;
  await f.resolve([], { continue: true });
  expect(f.calls.length).toBe(calls);
  expect(readBase(f.root)?.version).toBe('v4');
});

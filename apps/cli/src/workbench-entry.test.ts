import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectWorkbenchEntry, workbenchScope, workerEntry, assertRequestedGame } from './workbench-entry.js';
import { parseArgv } from './argv.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function choose(args: string[], interactive = true, cwd = '/tmp') {
  return selectWorkbenchEntry({
    ...parseArgv(['node', 'cli', ...args]),
    bare: !args[0] || args[0].startsWith('-'),
    interactive,
    cwd,
  });
}
it('uses browser entry only for interactive defaults or explicit workbench flags', () => {
  expect(choose([])?.entry.mode).toBe('home');
  expect(choose(['create', 'A racer'])?.idea).toBe('A racer');
  expect(choose(['play', 'racer'])?.entry).toEqual({ mode: 'game', slug: 'racer' });
  for (const args of [[], ['repl'], ['play', 'racer'], ['create', 'racer']])
    expect(choose(args, false)).toBeUndefined();
  expect(choose(['create', '--play', 'A racer'], false)?.entry.mode).toBe('create');
  expect(choose(['play', '--edit', 'racer'], false)?.entry.slug).toBe('racer');
});
it('preserves terminal, raw preview, JSON, stop and help paths without spawning a worker', () => {
  for (const args of [
    ['--terminal'],
    ['repl', 'racer'],
    ['play', '--preview'],
    ['play', '--stop'],
    ['play', '--json'],
    ['create', '--help'],
    ['play', '--edit', '--help'],
  ])
    expect(choose(args)).toBeUndefined();
  expect(() => choose(['play', '--edit', '--json'])).toThrow('cannot be combined');
  expect(() => choose(['play', 'racer', 'other'])).toThrow('game-slug');
  expect(() => choose(['play', 'racer /quit'])).toThrow('game-slug');
});
it('isolates create and game identities while canonicalizing a local game checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-entry-'));
  roots.push(root);
  const game = join(root, 'racer');
  mkdirSync(game);
  writeFileSync(join(game, '.gamedev-slug'), 'racer');
  const opened = choose(['play', 'racer'], true, root);
  const created = choose(['create', 'A different game'], true, game)!;
  expect(created.entry).toEqual({ mode: 'create' });
  expect(created).not.toHaveProperty('token');
  expect(workbenchScope(game, created.entry)).not.toBe(workbenchScope(game, { mode: 'game', slug: 'racer' }));
  expect(workbenchScope(root, { mode: 'game', slug: 'one' })).not.toBe(
    workbenchScope(root, { mode: 'game', slug: 'two' }),
  );
  expect(opened?.entry.slug).toBe('racer');
  expect(opened?.cwd).toBe(game);
});

it('never infers an existing checkout for new-game intake and resumes known creation outcomes', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-create-'));
  roots.push(root);
  writeFileSync(join(root, '.gamedev-slug'), 'old-game');
  const journal = {
    version: 1 as const,
    instance: 'one',
    cwd: root,
    launch: { mode: 'create' as const },
    initial: 'Make a racer',
  };
  expect(workerEntry(journal)).toEqual({ checkout: undefined, slug: undefined, initialLine: 'Make a racer' });
  expect(workerEntry({ ...journal, initial: undefined, slug: 'new-game', token: 'token' })).toEqual({
    checkout: undefined,
    slug: 'new-game',
    initialLine: '/checkout new-game',
  });
  expect(workerEntry({ ...journal, launch: { mode: 'game', slug: 'old-game' }, initial: undefined }).initialLine).toBe(
    '/checkout old-game',
  );
  expect(workerEntry({ ...journal, launch: { mode: 'game', slug: 'different-game' }, initial: undefined })).toEqual({
    checkout: undefined,
    slug: 'different-game',
    initialLine: '/checkout different-game',
  });
  expect(() => assertRequestedGame({ ...journal, slug: 'other-game' }, { mode: 'game', slug: 'old-game' })).toThrow(
    'now edits other-game',
  );
});

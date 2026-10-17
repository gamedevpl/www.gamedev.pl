import { describe, expect, it } from 'vitest';
import { historyTree, reverseVersion, validateTree } from './history-edit-tree.js';
import type { VersionHistoryTree } from '@gamedevpl/contract';

const tree = (files: Record<string, string | Buffer>) =>
  new Map(Object.entries(files).map(([path, data]) => [path, Buffer.from(data)]));
const lines = (first: string, last: string) =>
  ['one', first, ...Array.from({ length: 12 }, (_, i) => `middle ${i}`), last, 'last', ''].join('\n');

describe('inverse delivered changes with real Git', () => {
  it('preserves later edits to the same file and reverses additions/deletions', async () => {
    const parent = tree({ 'game.ts': lines('before', 'before'), 'deleted.ts': 'bring back\n' });
    const target = tree({ 'game.ts': lines('delivery', 'before'), 'added.ts': 'remove\n' });
    const current = tree({ 'game.ts': lines('delivery', 'later'), 'added.ts': 'remove\n', 'later.ts': 'keep\n' });
    const result = await reverseVersion('probe', 'v2', target, parent, current);
    expect(result.get('game.ts')?.toString()).toBe(lines('before', 'later'));
    expect(result.get('deleted.ts')?.toString()).toBe('bring back\n');
    expect(result.has('added.ts')).toBe(false);
    expect(result.get('later.ts')?.toString()).toBe('keep\n');
  });
  it('reverses a root delivery without deleting later additions', async () => {
    const initial = tree({ 'initial.ts': 'initial\n' });
    const result = await reverseVersion(
      'probe',
      'v1',
      initial,
      undefined,
      tree({ 'initial.ts': 'initial\n', 'later.ts': 'keep\n' }),
    );
    expect([...result.keys()]).toEqual(['later.ts']);
  });
  it('retains binary bytes, and refuses overlapping binary changes', async () => {
    const parent = tree({ 'images/test.png': Buffer.from([0, 255, 3]) }),
      target = tree({ 'images/test.png': Buffer.from([0, 254, 4]) });
    expect((await reverseVersion('probe', 'v2', target, parent, target)).get('images/test.png')).toEqual(
      Buffer.from([0, 255, 3]),
    );
    await expect(
      reverseVersion('probe', 'v2', target, parent, tree({ 'images/test.png': Buffer.from([0, 253, 5]) })),
    ).rejects.toThrow('conflict');
  });
  it('refuses overlapping text and modify/delete conflicts', async () => {
    await expect(
      reverseVersion(
        'probe',
        'v2',
        tree({ 'game.ts': 'two\n' }),
        tree({ 'game.ts': 'one\n' }),
        tree({ 'game.ts': 'three\n' }),
      ),
    ).rejects.toThrow('conflict');
    await expect(
      reverseVersion('probe', 'v2', tree({ 'added.ts': 'original\n' }), tree({}), tree({ 'added.ts': 'later\n' })),
    ).rejects.toThrow('conflict');
  });
  it('reverses a rename while retaining later content changes', async () => {
    const result = await reverseVersion(
      'probe',
      'v2',
      tree({ 'new.ts': lines('same', 'same') }),
      tree({ 'old.ts': lines('same', 'same') }),
      tree({ 'new.ts': lines('same', 'later') }),
    );
    expect(result.has('new.ts')).toBe(false);
    expect(result.get('old.ts')?.toString()).toBe(lines('same', 'later'));
  });
});

it('validates complete source manifests, encoding, structural and case collisions', () => {
  const input = { metadata: { sourceFiles: ['game.ts'] }, files: [] } as unknown as VersionHistoryTree;
  expect(() => historyTree(input)).toThrow('Incomplete');
  expect(() => historyTree({ ...input, files: [{ path: 'game.ts', content: '!', encoding: 'base64' }] })).toThrow(
    'binary',
  );
  expect(() => validateTree(tree({ 'foo.ts': 'x', 'foo.ts/bar.ts': 'y' }))).toThrow('Invalid');
  expect(() => validateTree(tree({ 'images/foo.png': 'x', 'images/FOO.PNG': 'y' }))).toThrow('Case-colliding');
  expect(() => validateTree(tree({ '../outside.ts': 'x' }))).toThrow('Invalid');
});

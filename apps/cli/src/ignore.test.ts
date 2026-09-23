import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createIgnoreMatcher } from './ignore.js';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'gdpl-ign-'));
}

describe('ignore matcher', () => {
  it('ignores .git even when a rule tries to put it back', () => {
    const dir = root();
    writeFileSync(join(dir, '.gamedevplignore'), '!.git\n!.git/**\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('.git', true)).toEqual({ source: 'git', pattern: '.git' });
    expect(match.ignored('game/.git/config', false)?.source).toBe('git');
    expect(match.ignored('game.ts', false)).toBeNull();
  });

  it('honors gitignore globs, anchors, and negations', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), '*.log\n!keep.log\n/only-root.txt\nsecret/\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('debug.log', false)?.source).toBe('gitignore');
    expect(match.ignored('dir/debug.log', false)?.pattern).toBe('*.log');
    expect(match.ignored('keep.log', false)).toBeNull();
    expect(match.ignored('only-root.txt', false)?.pattern).toBe('/only-root.txt');
    expect(match.ignored('dir/only-root.txt', false)).toBeNull();
    expect(match.ignored('secret', true)?.pattern).toBe('secret/');
    expect(match.ignored('secret/note.txt', false)?.pattern).toBe('secret/');
  });

  it('lets a nested negation keep a file when the directory itself is not excluded', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), 'secret/*\n!secret/keep.txt\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('secret', true)).toBeNull();
    expect(match.ignored('secret/keep.txt', false)).toBeNull();
    expect(match.ignored('secret/other.txt', false)?.pattern).toBe('secret/*');
  });

  it('applies .gamedevplignore after .gitignore', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), '*.log\n');
    writeFileSync(join(dir, '.gamedevplignore'), '!keep.log\n*.draft\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('debug.log', false)?.source).toBe('gitignore');
    expect(match.ignored('keep.log', false)).toBeNull();
    expect(match.ignored('notes.draft', false)).toEqual({ source: 'gamedevplignore', pattern: '*.draft' });
  });

  it('reads a nested ignore file relative to its directory', () => {
    const dir = root();
    mkdirSync(join(dir, 'games', 'sky'), { recursive: true });
    writeFileSync(join(dir, 'games', 'sky', '.gitignore'), 'tmp/\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('games/sky/tmp', true)?.pattern).toBe('tmp/');
    expect(match.ignored('games/sky/tmp/out.js', false)?.pattern).toBe('tmp/');
    expect(match.ignored('games/sky/game.ts', false)).toBeNull();
  });

  it('matches star-star across directories', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), '**/scratch/**\nfoo/**/bar\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('a/scratch/b.txt', false)?.pattern).toBe('**/scratch/**');
    expect(match.ignored('foo/bar', false)?.pattern).toBe('foo/**/bar');
    expect(match.ignored('foo/x/y/bar', false)?.pattern).toBe('foo/**/bar');
    expect(match.ignored('foo/x/baz', false)).toBeNull();
  });

  it('keeps a leading space in a pattern', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), ' foo\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored(' foo', false)?.pattern).toBe(' foo');
    expect(match.ignored('foo', false)).toBeNull();
  });

  it('supports character classes with caret and exclamation negation', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), '[^a]*.ts\n[!b]*.js\n[a-z].txt\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('game.ts', false)?.pattern).toBe('[^a]*.ts');
    expect(match.ignored('apple.ts', false)).toBeNull();
    expect(match.ignored('apple.js', false)?.pattern).toBe('[!b]*.js');
    expect(match.ignored('banana.js', false)).toBeNull();
    expect(match.ignored('c.txt', false)?.pattern).toBe('[a-z].txt');
    expect(match.ignored('1.txt', false)).toBeNull();
  });

  it('keeps earlier rules when one character class is not a JavaScript regexp', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), '*.secret\n[z-a]\n');
    const match = createIgnoreMatcher(dir);
    expect(match.ignored('token.secret', false)?.pattern).toBe('*.secret');
    expect(match.ignored('a', false)).toBeNull();
  });

  it('honors a pattern longer than 240 characters', () => {
    const dir = root();
    const name = `${'a'.repeat(241)}.secret`;
    writeFileSync(join(dir, '.gitignore'), `${name}\n`);
    const match = createIgnoreMatcher(dir);
    expect(match.ignored(name, false)?.pattern).toBe(name);
    expect(match.ignored('short.secret', false)).toBeNull();
  });

  it('refuses an ignore file larger than 256 KiB', () => {
    const dir = root();
    writeFileSync(join(dir, '.gitignore'), Buffer.alloc(256 * 1024 + 1, 35));
    expect(() => createIgnoreMatcher(dir).ignored('token.secret', false)).toThrow(/\.gitignore is larger than 256 KiB/);
  });

  it('refuses when an ignore file cannot be read', () => {
    const dir = root();
    const file = join(dir, '.gitignore');
    writeFileSync(file, '*.secret\n');
    chmodSync(file, 0);
    try {
      expect(() => createIgnoreMatcher(dir).ignored('token.secret', false)).toThrow(/could not read \.gitignore/);
    } finally {
      chmodSync(file, 0o644);
    }
  });

  it('does not follow a symlinked ignore file', () => {
    const dir = root();
    const outside = root();
    writeFileSync(join(outside, 'rules'), '*.ts\n');
    symlinkSync(join(outside, 'rules'), join(dir, '.gitignore'));
    expect(createIgnoreMatcher(dir).ignored('game.ts', false)).toBeNull();
  });
});

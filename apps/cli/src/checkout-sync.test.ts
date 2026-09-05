import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { classify, hashesOf, pathInside, readBase, writeBase } from './checkout-sync.js';
import { CliError } from './exit-codes.js';

describe('three-way checkout sync', () => {
  const game = (content: string) => [{ path: 'game.ts', content }];

  it('treats a local edit against an unchanged platform as local-only', () => {
    const sync = classify({
      local: game('B'),
      remote: game('A'),
      remoteVersion: 'v1',
      base: { version: 'v1', files: hashesOf(game('A')) },
    });
    expect(sync.kind).toBe('local_only');
    expect(sync.local).toEqual(['game.ts']);
    expect(sync.conflict).toEqual([]);
  });

  it('treats a platform update of a clean checkout as platform-only', () => {
    const sync = classify({
      local: game('A'),
      remote: game('C'),
      remoteVersion: 'v2',
      base: { version: 'v1', files: hashesOf(game('A')) },
    });
    expect(sync.kind).toBe('platform_only');
    expect(sync.platform).toEqual(['game.ts']);
  });

  it('flags overlapping edits as a conflict', () => {
    const sync = classify({
      local: game('B'),
      remote: game('C'),
      remoteVersion: 'v2',
      base: { version: 'v1', files: hashesOf(game('A')) },
    });
    expect(sync.kind).toBe('conflict');
    expect(sync.conflict).toEqual(['game.ts']);
  });

  it('keeps non-overlapping edits as both, not a conflict', () => {
    const sync = classify({
      local: [
        { path: 'game.ts', content: 'B' },
        { path: 'hud.ts', content: 'h' },
      ],
      remote: [
        { path: 'game.ts', content: 'A' },
        { path: 'hud.ts', content: 'H2' },
      ],
      remoteVersion: 'v2',
      base: {
        version: 'v1',
        files: hashesOf([
          { path: 'game.ts', content: 'A' },
          { path: 'hud.ts', content: 'h' },
        ]),
      },
    });
    expect(sync.kind).toBe('both');
    expect(sync.local).toEqual(['game.ts']);
    expect(sync.platform).toEqual(['hud.ts']);
  });

  it('treats a local delete as local-only and a platform delete as platform-only', () => {
    const localDelete = classify({
      local: [],
      remote: game('A'),
      remoteVersion: 'v1',
      base: { version: 'v1', files: hashesOf(game('A')) },
    });
    expect(localDelete.kind).toBe('local_only');
    expect(localDelete.local).toEqual(['game.ts']);
    const platformDelete = classify({
      local: game('A'),
      remote: [],
      remoteVersion: 'v2',
      base: { version: 'v1', files: hashesOf(game('A')) },
    });
    expect(platformDelete.kind).toBe('platform_only');
    expect(platformDelete.platform).toEqual(['game.ts']);
  });

  it('marks a checkout without base metadata as legacy when it differs', () => {
    const sync = classify({
      local: game('B'),
      remote: game('A'),
      remoteVersion: 'v1',
      base: null,
    });
    expect(sync.kind).toBe('legacy');
  });

  it('adopts a matching tree without a base as clean', () => {
    const sync = classify({
      local: game('A'),
      remote: game('A'),
      remoteVersion: 'v1',
      base: null,
    });
    expect(sync.kind).toBe('clean');
  });

  it('refuses paths that leave the checkout', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-esc-'));
    expect(() => pathInside(dest, '../secret')).toThrow(CliError);
    writeBase(dest, 'v1', game('A'));
    expect(readBase(dest)?.version).toBe('v1');
    expect(existsSync(join(dest, '.gamedev-base.json'))).toBe(true);
    mkdirSync(join(dest, 'games'), { recursive: true });
    writeFileSync(join(dest, 'games', 'note.txt'), 'x');
    expect(readFileSync(join(dest, '.gamedev-base.json'), 'utf8')).toContain('v1');
  });
});

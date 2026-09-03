import { mkdirSync, mkdtempSync, writeFileSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { checkoutGame, changedPaths, localGameFiles, unreconciledMessage, writeGameFiles } from './checkout.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';

describe('checkout', () => {
  it('always inits git with a gamedevpl:// remote', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-co-'));
    const commands: string[] = [];
    const result = await checkoutGame({
      api: createApi({
        origin: 'https://www.gamedev.pl',
        store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
        fetch: async () => new Response('archive'),
      }),
      slug: 'ghost-roads',
      dest,
      fetchBuffer: async () => Buffer.from('archive'),
      run: (cmd, args) => {
        commands.push([cmd, ...args].join(' '));
      },
    });
    expect(result.remote).toBe('gamedevpl://ghost-roads');
    expect(commands).toContain('tar -xzf .gamedev-workspace.tgz');
    expect(commands).toContain('git init');
    expect(commands).toContain('git remote add origin gamedevpl://ghost-roads');
    expect(existsSync(join(dest, '.gamedev-workspace.tgz'))).toBe(false);
  });

  it('treats a missing remote file as unreconciled', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-df-'));
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'export const n = 1;\n');
    expect(changedPaths([{ path: 'game.ts', content: 'export const n = 1;\n' }], [])).toEqual(['game.ts']);
    expect(unreconciledMessage()).toContain('gamedevpl pull');
    expect(dirname(join(dest, 'games', 'ghost-roads', 'game.ts'))).toContain('ghost-roads');
  });

  it('removes local files the platform tree no longer has', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-pl-'));
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'old.ts'), 'gone\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'keep\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(existsSync(join(dest, 'games', 'ghost-roads', 'old.ts'))).toBe(false);
  });

  it('does not follow outbound symlinks when reconciling', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ln-'));
    const outside = mkdtempSync(join(tmpdir(), 'gdpl-out-'));
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'keep\n');
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'keep\n');
    symlinkSync(outside, join(dest, 'games', 'ghost-roads', 'leak'));
    expect(
      localGameFiles(dest, 'ghost-roads')
        .map((file) => file.path)
        .sort(),
    ).toEqual(['game.ts', 'leak']);
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(existsSync(secret)).toBe(true);
    expect(existsSync(join(dest, 'games', 'ghost-roads', 'leak'))).toBe(false);
  });

  it('unlinks a matching symlink before writing the pulled file', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ln2-'));
    const outside = mkdtempSync(join(tmpdir(), 'gdpl-out2-'));
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'keep\n');
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    symlinkSync(secret, join(dest, 'games', 'ghost-roads', 'game.ts'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(readFileSync(secret, 'utf8')).toBe('keep\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('next\n');
  });
});

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { checkoutGame, changedPaths, unreconciledMessage, writeGameFiles } from './checkout.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';

describe('checkout', () => {
  it('always inits git with a gamedev:// remote', async () => {
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
    expect(result.remote).toBe('gamedev://ghost-roads');
    expect(commands).toContain('tar -xzf .gamedev-workspace.tgz');
    expect(commands).toContain('git init');
    expect(commands).toContain('git remote add origin gamedev://ghost-roads');
    expect(existsSync(join(dest, '.gamedev-workspace.tgz'))).toBe(false);
  });

  it('treats a missing remote file as unreconciled', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-df-'));
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'export const n = 1;\n');
    expect(changedPaths([{ path: 'game.ts', content: 'export const n = 1;\n' }], [])).toEqual(['game.ts']);
    expect(unreconciledMessage()).toContain('gamedev pull');
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
});

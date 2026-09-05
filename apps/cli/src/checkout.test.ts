import { mkdirSync, mkdtempSync, writeFileSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  checkoutGame,
  changedPaths,
  localGameFiles,
  pullGame,
  unreconciledMessage,
  writeBase,
  writeGameFiles,
} from './checkout.js';
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

  it('pulls a platform-only update and keeps a local-only edit', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-pl3-'));
    writeGameFiles(dest, 'ghost-roads', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeBase(dest, 'v1', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({
              versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts', 'hud.ts'] }],
            }),
            {
              status: 200,
            },
          );
        }
        return new Response(
          JSON.stringify({
            version: 'v2',
            files: [
              { path: 'game.ts', content: 'A' },
              { path: 'hud.ts', content: 'H2' },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest });
    expect(pulled.kept).toEqual(['game.ts']);
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'hud.ts'), 'utf8')).toBe('H2');
  });

  it('overwrites local files on pull --force and reports none kept', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-plf-'));
    writeGameFiles(dest, 'ghost-roads', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeBase(dest, 'v1', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({
              versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts', 'hud.ts'] }],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            version: 'v2',
            files: [
              { path: 'game.ts', content: 'A' },
              { path: 'hud.ts', content: 'H2' },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest, force: true });
    expect(pulled.kept).toEqual([]);
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('A');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'hud.ts'), 'utf8')).toBe('H2');
  });

  it('refuses a conflicting pull without deleting local files', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-cf-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts'] }] }),
            {
              status: 200,
            },
          );
        }
        return new Response(JSON.stringify({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] }), {
          status: 200,
        });
      },
    });
    await expect(pullGame({ api, slug: 'ghost-roads', dest })).rejects.toMatchObject({
      message: expect.stringMatching(/conflict/),
    });
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
  });

  it('refuses pull on a legacy checkout that differs from the platform', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-lg-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'B' }]);
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] }),
            {
              status: 200,
            },
          );
        }
        return new Response(JSON.stringify({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] }), {
          status: 200,
        });
      },
    });
    await expect(pullGame({ api, slug: 'ghost-roads', dest })).rejects.toMatchObject({
      message: expect.stringMatching(/no base version/),
    });
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
  });

  it('refuses a path that would leave the checkout', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-esc2-'));
    expect(() => writeGameFiles(dest, 'ghost-roads', [{ path: '../outside.ts', content: 'nope' }])).toThrow(/outside/);
  });
});

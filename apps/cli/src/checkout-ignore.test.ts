import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { pullGame, readBase, writeBase, writeGameFiles } from './checkout.js';
import { CliError } from './exit-codes.js';
import { memoryStore } from './keychain.js';

describe('pull and ignored platform files', () => {
  it('updates the game and leaves an ignored platform file unwritten', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-absent-'));
    writeFileSync(join(dest, '.gitignore'), '*.log\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    const files = [
      { path: 'game.ts', content: 'B' },
      { path: 'extra.log', content: 'platform\n' },
    ];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/versions')
              ? { versions: [{ version: 'v2', createdAt: '2026-09-13', sourceFiles: ['game.ts', 'extra.log'] }] }
              : { version: 'v2', files },
          ),
          { status: 200 },
        ),
    });
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest });
    expect(pulled.notices.join('\n')).toContain('left ignored platform files unwritten: extra.log');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
    expect(existsSync(join(dest, 'games', 'ghost-roads', 'extra.log'))).toBe(false);
    expect(readBase(dest)?.files['extra.log']).toBeUndefined();
  });

  it('refuses to replace an ignored directory with a platform file', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-dir-'));
    writeFileSync(join(dest, '.gitignore'), 'cache/\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    mkdirSync(join(dest, 'games', 'ghost-roads', 'cache'));
    writeFileSync(join(dest, 'games', 'ghost-roads', 'cache', 'local.txt'), 'keep\n');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/versions')
              ? { versions: [{ version: 'v2', createdAt: '2026-09-13', sourceFiles: ['game.ts', 'cache'] }] }
              : {
                  version: 'v2',
                  files: [
                    { path: 'game.ts', content: 'B' },
                    { path: 'cache', content: 'platform\n' },
                  ],
                },
          ),
          { status: 200 },
        ),
    });
    const caught = await pullGame({ api, slug: 'ghost-roads', dest }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('cache');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('A');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'cache', 'local.txt'), 'utf8')).toBe('keep\n');
  });

  it('refuses when an ignored file blocks a platform directory and replaces it on force', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-block-'));
    writeFileSync(join(dest, '.gitignore'), 'cache\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'cache'), 'blocking file\n');
    const files = [
      { path: 'game.ts', content: 'A2' },
      { path: 'cache/state.json', content: '{"ok":true}\n' },
    ];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/versions')
              ? { versions: [{ version: 'v2', createdAt: '2026-09-13', sourceFiles: ['game.ts', 'cache/state.json'] }] }
              : { version: 'v2', files },
          ),
          { status: 200 },
        ),
    });
    const caught = await pullGame({ api, slug: 'ghost-roads', dest }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('cache/state.json');
    expect((caught as CliError).next).toContain('pull --force');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'cache'), 'utf8')).toBe('blocking file\n');
    const forced = await pullGame({ api, slug: 'ghost-roads', dest, force: true });
    expect(forced.notices.join('\n')).toContain('cache/state.json');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'cache', 'state.json'), 'utf8')).toBe('{"ok":true}\n');
  });

  it('refuses an unignored local file colliding with a platform directory on ordinary pull', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-struct-block-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'cache'), 'user unsubmitted file\n');
    const files = [
      { path: 'game.ts', content: 'A' },
      { path: 'cache/state.json', content: '{"ok":true}\n' },
    ];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/versions')
              ? { versions: [{ version: 'v2', createdAt: '2026-09-13', sourceFiles: ['game.ts', 'cache/state.json'] }] }
              : { version: 'v2', files },
          ),
          { status: 200 },
        ),
    });
    const caught = await pullGame({ api, slug: 'ghost-roads', dest }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('conflict');
    expect((caught as CliError).message).toContain('cache');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'cache'), 'utf8')).toBe('user unsubmitted file\n');
    const forced = await pullGame({ api, slug: 'ghost-roads', dest, force: true });
    expect(forced.version).toBe('v2');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'cache', 'state.json'), 'utf8')).toBe('{"ok":true}\n');
  });
});

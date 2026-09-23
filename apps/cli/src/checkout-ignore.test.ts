import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { pullGame, readBase, writeBase, writeGameFiles } from './checkout.js';
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
});

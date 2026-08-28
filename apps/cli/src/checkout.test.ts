import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutGame } from './checkout.js';
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
        fetch: async () => new Response('{}'),
      }),
      slug: 'ghost-roads',
      dest,
      run: (cmd, args) => {
        commands.push([cmd, ...args].join(' '));
      },
    });
    expect(result.remote).toBe('gamedev://ghost-roads');
    expect(commands).toContain('git init');
    expect(commands).toContain('git remote add origin gamedev://ghost-roads');
  });
});

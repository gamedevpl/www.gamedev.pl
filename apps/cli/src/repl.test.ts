import { describe, expect, it } from 'vitest';
import { handleReplLine } from './repl.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';

describe('repl turn loop', () => {
  it('prints a reply and does not invent a second request', async () => {
    const lines: string[] = [];
    let posts = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/turn')) {
          posts += 1;
          return new Response(JSON.stringify({ kind: 'reply', text: 'Still building.' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      },
    });
    await handleReplLine({ line: 'is it done yet?', api, token: 'tok', write: (s) => lines.push(s) });
    expect(posts).toBe(1);
    expect(lines.join('\n')).toContain('Still building.');
    expect(lines.join('\n')).not.toMatch(/build /);
  });
});

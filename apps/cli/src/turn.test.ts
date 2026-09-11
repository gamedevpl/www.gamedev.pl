import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { isTerminalStatus, postTurn } from './turn.js';
import { CliError, EXIT_AUTH } from './exit-codes.js';

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  return async (url: string, init?: RequestInit) => {
    const result = handler(url, init);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('isTerminalStatus', () => {
  it('stops a watch on published or abandoned', () => {
    expect(isTerminalStatus('published')).toBe(true);
    expect(isTerminalStatus('abandoned')).toBe(true);
    expect(isTerminalStatus('building')).toBe(false);
    expect(isTerminalStatus('needs_changes')).toBe(false);
  });
});

describe('turn client', () => {
  it('returns a reply without treating it as a build', async () => {
    let posts = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_test', tokenType: 'Bearer', scope: 'creator' }),
      fetch: mockFetch((url) => {
        if (url.endsWith('/turn')) {
          posts += 1;
          return { status: 200, body: { kind: 'reply', text: 'Still building.' } };
        }
        return { status: 404, body: { error: 'not found' } };
      }),
    });
    const result = await postTurn(api, 'tok', 'is it done yet?');
    expect(result).toEqual({ kind: 'reply', text: 'Still building.' });
    expect(posts).toBe(1);
  });

  it('maps 401 to auth failure', async () => {
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_dead', tokenType: 'Bearer', scope: 'creator' }),
      fetch: mockFetch(() => ({ status: 401, body: { error: 'invalid token' } })),
    });
    await expect(postTurn(api, 'tok', 'hi')).rejects.toMatchObject({ exitCode: EXIT_AUTH } satisfies Partial<CliError>);
  });
});

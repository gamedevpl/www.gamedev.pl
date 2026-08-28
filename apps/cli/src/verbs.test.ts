import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { dispatchReadVerb } from './verbs.js';
import { EXIT_GREEN } from './exit-codes.js';

function out() {
  const stdout = new PassThrough();
  let text = '';
  stdout.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    read: () => text,
  };
}

describe('dispatchReadVerb', () => {
  it('lists games from /api/submissions/mine', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () =>
        new Response(JSON.stringify({ submissions: [{ slug: 'ghost-roads', title: 'Ghost' }] }), { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'games', args: [], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('ghost-roads');
  });

  it('prints a play URL for share', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'share', args: ['sky-dodge'], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('/play/sky-dodge');
  });
});

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

  it('reads builder from owner studio + submission status', async () => {
    const io = out();
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        seen.push(String(url));
        if (String(url).includes('/api/me/studio')) {
          return new Response(JSON.stringify({ games: [{ slug: 'sky-dodge', token: 'tok-1' }] }), { status: 200 });
        }
        if (String(url).endsWith('/api/submissions/tok-1')) {
          return new Response(JSON.stringify({ status: 'building', builder: 'self' }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    expect(await dispatchReadVerb({ verb: 'builder', args: ['sky-dodge'], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('self');
    expect(seen.some((url) => url.includes('/api/me/studio?game=sky-dodge'))).toBe(true);
    expect(seen.some((url) => url.endsWith('/api/submissions/tok-1'))).toBe(true);
    expect(seen.some((url) => url.includes('/connect'))).toBe(false);
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

  it('prints quota as a sentence, not raw JSON', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response(JSON.stringify({ submissions: { used: 1, limit: 5 } }), { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'quota', args: [], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read().trim()).toBe('1 of 5 submissions today');
  });
});

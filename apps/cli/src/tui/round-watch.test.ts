import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../api.js';
import { memoryStore } from '../keychain.js';
import { createRoundWatch } from './round-watch.js';

describe('round watch', () => {
  it('paints live building then announces when Studio is waiting', async () => {
    const live: string[][] = [];
    const announced: string[] = [];
    let polls = 0;
    const holder: { current?: ReturnType<typeof createRoundWatch> } = {};
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        polls += 1;
        const body =
          polls === 1
            ? { status: 'building', slug: 'diminishing-sparks' }
            : { status: 'needs_changes', slug: 'diminishing-sparks', previewGate: { green: true } };
        if (polls >= 2) holder.current?.stop();
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });
    const slugs: string[] = [];
    holder.current = createRoundWatch({
      getToken: () => 'tok',
      api,
      setLive: (lines) => live.push(lines),
      announce: (text) => announced.push(text),
      onSlug: (slug) => slugs.push(slug),
      sleep: async () => undefined,
    });
    await holder.current.run;
    expect(polls).toBe(2);
    expect(live[0]?.[0]).toBe('building');
    expect(announced).toEqual(['round finished — Studio is waiting (preview green)']);
    expect(live.at(-1)?.[0]).toContain('round finished');
    expect(slugs).toEqual(['diminishing-sparks', 'diminishing-sparks']);
  });

  it('stops polling once the round is published', async () => {
    let polls = 0;
    const announced: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        polls += 1;
        return new Response(JSON.stringify({ status: 'published' }), { status: 200 });
      },
    });
    const watch = createRoundWatch({
      getToken: () => 'tok',
      api,
      setLive: () => undefined,
      announce: (text) => announced.push(text),
      sleep: async () => {
        throw new Error('should not sleep after published');
      },
    });
    await vi.waitFor(() => expect(announced).toEqual(['published']));
    watch.stop();
    await watch.run;
    expect(polls).toBe(1);
    expect(announced).toEqual(['published']);
  });

  it('paints auth failures on the live strip and ignores 404', async () => {
    const live: string[][] = [];
    const holder: { current?: ReturnType<typeof createRoundWatch> } = {};
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        holder.current?.stop();
        return new Response('{}', { status: 401 });
      },
    });
    holder.current = createRoundWatch({
      getToken: () => 'tok',
      api,
      setLive: (lines) => live.push(lines),
      announce: () => undefined,
      sleep: async () => undefined,
    });
    await holder.current.run;
    expect(live[0]?.[0]).toMatch(/credential expired/);

    const ignored: string[][] = [];
    const miss: { current?: ReturnType<typeof createRoundWatch> } = {};
    const missingApi = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        miss.current?.stop();
        return new Response('{}', { status: 404 });
      },
    });
    miss.current = createRoundWatch({
      getToken: () => 'tok',
      api: missingApi,
      setLive: (lines) => ignored.push(lines),
      announce: () => undefined,
      sleep: async () => undefined,
    });
    await miss.current.run;
    expect(ignored).toEqual([]);
  });
});

it('wakes for a new round after publication instead of keeping the old live strip', async () => {
  let token = 'old';
  const live: string[][] = [];
  const request = vi.fn(async () => ({ status: token === 'old' ? 'published' : 'building' }));
  const watch = createRoundWatch({
    getToken: () => token,
    api: { origin: 'https://example.test', request } as unknown as import('../api.js').ApiClient,
    setLive: (lines) => live.push(lines),
    announce: () => undefined,
    sleep: () => new Promise(() => undefined),
  });
  await vi.waitFor(() => expect(live.at(-1)?.[0]).toBe('published'));
  expect(request).toHaveBeenCalledTimes(1);
  token = 'new';
  watch.poke();
  await vi.waitFor(() => expect(live.at(-1)?.[0]).toBe('building'));
  expect(request).toHaveBeenLastCalledWith('GET', '/api/submissions/new');
  watch.stop();
  await watch.run;
});

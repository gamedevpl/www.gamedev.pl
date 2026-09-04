import { describe, expect, it } from 'vitest';
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
});

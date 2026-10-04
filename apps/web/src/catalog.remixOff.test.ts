import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, offersRemix } from './catalog.js';

describe('catalog remixOff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads remixOff only when it is exactly true, and stops offering remix then', async () => {
    const base = { title: 'G', genre: '', controls: '', status: 'published', editor: 'content' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { ...base, slug: 'off', remixOff: true },
          { ...base, slug: 'stringy', remixOff: 'true' },
          { ...base, slug: 'absent' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.remixOff)).toEqual([true, undefined, undefined]);
    expect(entries.map((entry) => offersRemix(entry))).toEqual([false, true, true]);
  });
});

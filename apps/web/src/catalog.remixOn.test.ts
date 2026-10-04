import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, offersRemix } from './catalog.js';

describe('catalog remixOn', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads remixOn only when it is exactly true, and offers remix only then', async () => {
    const base = { title: 'G', genre: '', controls: '', status: 'published', editor: 'content' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { ...base, slug: 'on', remixOn: true },
          { ...base, slug: 'stringy', remixOn: 'true' },
          { ...base, slug: 'absent' },
          { ...base, slug: 'no-lane', editor: null, remixOn: true },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.remixOn)).toEqual([true, undefined, undefined, true]);
    expect(entries.map((entry) => offersRemix(entry))).toEqual([true, false, false, false]);
  });
});

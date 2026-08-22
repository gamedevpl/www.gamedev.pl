import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllAdminAssessments } from './assessmentExportApi.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAllAdminAssessments', () => {
  it('collects every detailed assessment page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const offset = Number(new URL(url, 'https://example.test').searchParams.get('offset'));
      const page =
        offset === 0
          ? {
              total: 3,
              resolved: 1,
              open: 2,
              games: [],
              recent: [{ id: 'one' }, { id: 'two' }],
              offset: 0,
              limit: 2,
              nextOffset: 2,
            }
          : {
              total: 3,
              resolved: 1,
              open: 2,
              games: [],
              recent: [{ id: 'three' }],
              offset: 2,
              limit: 2,
              nextOffset: null,
            };
      return new Response(JSON.stringify(page), { status: 200 });
    });

    const result = await fetchAllAdminAssessments();

    expect(result.recent.map((row) => row.id)).toEqual(['one', 'two', 'three']);
    expect(result).toEqual(expect.objectContaining({ total: 3, resolved: 1, open: 2 }));
    expect(result).not.toHaveProperty('nextOffset');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain('offset=2');
  });
});

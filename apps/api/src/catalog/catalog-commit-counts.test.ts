import { describe, expect, it, vi } from 'vitest';
import { fetchGameCommitCounts, slugsFromArchivePaths, withArchiveCommitCounts } from './catalog-commit-counts.js';

describe('slugsFromArchivePaths', () => {
  it('dedupes game directories', () => {
    expect(slugsFromArchivePaths(['games/a/game.ts', 'games/a/SPEC.md', 'games/b/game.ts', 'shared/core.ts'])).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('fetchGameCommitCounts', () => {
  it('reads history totalCount aliases', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              object: {
                c0: { totalCount: 12 },
                c1: { totalCount: 3 },
              },
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const counts = await fetchGameCommitCounts({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      slugs: ['rich-game', 'thin-game'],
      token: 'test-token',
      fetchImpl,
    });

    expect(counts.get('rich-game')).toBe(12);
    expect(counts.get('thin-game')).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const query = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body)) as { query: string };
    expect(query.query).toContain('first: 1');
  });

  it('returns an empty map when GraphQL fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const counts = await fetchGameCommitCounts({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      slugs: ['a'],
      token: 'test-token',
      fetchImpl,
    });
    expect(counts.size).toBe(0);
  });

  it('discards a partial map when a later chunk fails', async () => {
    const slugs = Array.from({ length: 21 }, (_, i) => `g${String(i).padStart(2, '0')}`);
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const object: Record<string, { totalCount: number }> = {};
        for (let i = 0; i < 20; i += 1) object[`c${i}`] = { totalCount: 9 };
        return new Response(JSON.stringify({ data: { repository: { object } } }), { status: 200 });
      }
      return new Response('nope', { status: 500 });
    }) as unknown as typeof fetch;

    const counts = await fetchGameCommitCounts({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      slugs,
      token: 'test-token',
      fetchImpl,
    });
    expect(counts.size).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('withArchiveCommitCounts', () => {
  it('attaches counts when GraphQL answers and leaves the archive alone on failure', async () => {
    const archive = { listPaths: () => ['games/rich/game.ts'], marker: true };
    const ok = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { repository: { object: { c0: { totalCount: 7 } } } } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const attached = await withArchiveCommitCounts(archive, {
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'test-token',
      fetchImpl: ok,
    });
    expect(attached.marker).toBe(true);
    expect(attached.commitCounts?.get('rich')).toBe(7);

    const failed = await withArchiveCommitCounts(archive, {
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'test-token',
      fetchImpl: vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
    });
    expect(failed.commitCounts).toBeUndefined();
    expect(failed.marker).toBe(true);
  });
});

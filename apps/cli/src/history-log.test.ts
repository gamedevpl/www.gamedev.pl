import { describe, expect, it, vi } from 'vitest';
import type { HistorySourceFile, HistoryVersion } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { filteredHistory, logOptions } from './history-log.js';
import { historyRows } from './history-api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

function fixture(count = 125) {
  const versions: HistoryVersion[] = Array.from({ length: count }, (_, index) => ({
    version: `v${String(count - index).padStart(4, '0')}`,
    createdAt: '2026-10-16T12:00:00Z',
    jobId: index,
    sourceFiles: ['game/ai.ts', 'game/other.ts'],
    verdict: 'passed',
    summary: index === 110 ? 'Fix Rails collision' : 'Other change',
  }));
  const calls: string[] = [];
  const trees = new Map<string, HistorySourceFile[]>();
  const api = {
    request: async (_method: string, path: string) => {
      calls.push(path);
      const url = new URL(path, 'https://fixture.invalid');
      if (url.pathname.endsWith('/versions')) {
        const cursor = url.searchParams.get('cursor');
        const remaining = versions.filter((row) => !cursor || row.version < cursor);
        const page = remaining.slice(0, Number(url.searchParams.get('limit')));
        const hasMore = remaining.length > page.length;
        return { versions: page, hasMore, nextCursor: hasMore ? page.at(-1)!.version : null };
      }
      const version = url.pathname.split('/').at(-2)!;
      return {
        version,
        metadata: versions.find((row) => row.version === version),
        files: (trees.get(version) ?? []).filter((file) => file.path === url.searchParams.get('path')),
      };
    },
  } as unknown as ApiClient;
  const run = async (flags = {}, paths: string[] = []) => {
    const out: HistoryVersion[] = [];
    for await (const row of filteredHistory(api, 'probe', logOptions(flags, paths))) out.push(row);
    return out;
  };
  return { versions, calls, trees, api, run };
}

describe('history filters', () => {
  it('reads all pages by default and applies the limit after matching', async () => {
    const f = fixture();
    expect(await f.run()).toHaveLength(125);
    f.calls.length = 0;
    expect((await f.run({ grep: 'rails', 'ignore-case': true, limit: '1' })).map((row) => row.summary)).toEqual([
      'Fix Rails collision',
    ]);
    expect(f.calls).toHaveLength(2);
    expect(f.calls.every((path) => !path.includes('/tree'))).toBe(true);
    expect(await f.run({ grep: 'rails' })).toHaveLength(0);
    f.calls.length = 0;
    expect(await f.run({ limit: '1' })).toHaveLength(1);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toContain('limit=1');
  });

  it('combines date and summary filters and includes the entire local until date', async () => {
    const f = fixture(3);
    f.versions[0]!.createdAt = '2026-10-17T00:00:00Z';
    f.versions[1]!.createdAt = '2026-10-16T12:00:00Z';
    f.versions[2]!.createdAt = '2026-10-15T12:00:00Z';
    expect(
      (await f.run({ since: '2026-10-16T00:00:00Z', until: '2026-10-16T23:59:59Z', grep: '^Other' })).map(
        (row) => row.version,
      ),
    ).toEqual(['v0002']);
    const options = logOptions({ since: '2026-10-16', until: '2026-10-16' }, []);
    const localLate = new Date(2026, 9, 16, 23, 59, 59, 999).getTime();
    expect(options.until).toBe(localLate);
    expect(options.since).toBe(new Date(2026, 9, 16).getTime());
    for (const flags of [
      { since: 'yesterday' },
      { until: '2026-02-30' },
      { since: true },
      { grep: '[' },
      { grep: true },
      { limit: 'Infinity' },
      { limit: true },
      { all: true, limit: '1' },
      { since: '2026-10-17', until: '2026-10-16' },
    ])
      expect(() => logOptions(flags, [])).toThrow();
  });

  it('compares actual bytes, includes deletions and caches only adjacent snapshots', async () => {
    const f = fixture(4);
    f.versions[2]!.sourceFiles = ['game/other.ts'];
    for (const row of f.versions)
      f.trees.set(
        row.version,
        row.sourceFiles.map((path) => ({
          path,
          content: path === 'game/other.ts' ? row.version : row.version === 'v0001' ? 'original' : 'changed',
        })),
      );
    expect((await f.run({}, ['game/ai.ts'])).map((row) => row.version)).toEqual(['v0003', 'v0002', 'v0001']);
    expect(f.calls.filter((path) => path.includes('/tree'))).toHaveLength(3);
    f.calls.length = 0;
    expect((await f.run({ limit: '1' }, ['game/ai.ts'])).map((row) => row.version)).toEqual(['v0003']);
    expect(f.calls.filter((path) => path.includes('/tree'))).toHaveLength(2);
    expect(await f.run({}, ['game'])).toHaveLength(4);
    expect(await f.run({}, ['missing.ts'])).toHaveLength(0);
    expect(await f.run({}, ['missing.ts', 'game/ai.ts'])).toHaveLength(3);
  });

  it('compares raster bytes and refuses unreadable snapshots instead of inventing changes', async () => {
    const f = fixture(2);
    for (const row of f.versions) {
      row.sourceFiles = ['images/test.png'];
      f.trees.set(row.version, [{ path: 'images/test.png', content: 'AP8K', encoding: 'base64' }]);
    }
    expect((await f.run({}, ['images/test.png'])).map((row) => row.version)).toEqual(['v0001']);
    f.trees.set('v0002', []);
    await expect(f.run({}, ['images/test.png'])).rejects.toThrow('missing a source file');
  });

  it('aborts a rate-limit wait promptly when the pager closes', async () => {
    const f = fixture();
    const error = new CliError('busy', EXIT_REFUSED);
    error.httpStatus = 429;
    error.retryAfterMs = 60_000;
    f.api.request = vi.fn(async () => {
      throw error;
    });
    const stop = new AbortController();
    const rows = historyRows(f.api, 'probe', 100, stop.signal);
    const next = rows.next();
    await vi.waitFor(() => expect(f.api.request).toHaveBeenCalledOnce());
    stop.abort(new Error('reader closed'));
    await expect(next).rejects.toThrow('reader closed');
    expect(f.api.request).toHaveBeenCalledOnce();
  });
});

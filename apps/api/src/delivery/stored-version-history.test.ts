import { describe, expect, it } from 'vitest';
import { listStoredVersions } from './stored-version-history.js';
import type { VersionManifest } from './games-store.js';

it('pages GCS directory listings, skips orphan uploads, and continues beyond 100 versions', async () => {
  const versions = Array.from({ length: 205 }, (_, i) => `v${String(i + 1).padStart(4, '0')}`);
  const requests: URL[] = [];
  const reads: string[] = [];
  const input = {
    slug: 'probe',
    bucket: 'bucket',
    getAccessToken: async () => 'fixture',
    fetchImpl: async (url: string | URL | Request) => {
      const query = new URL(String(url));
      requests.push(query);
      const offset = Number(query.searchParams.get('pageToken') ?? 0);
      const page = versions.slice(offset, offset + 80);
      return Response.json({
        prefixes: page.map((version) => `games/probe/versions/${version}/`),
        ...(offset + 80 < versions.length ? { nextPageToken: String(offset + 80) } : {}),
      });
    },
    readObject: async (path: string) => {
      reads.push(path);
      const version = path.split('/')[3]!;
      return version === 'v0205' ? null : Buffer.from(JSON.stringify({ version }));
    },
    parse: (body: Buffer) => JSON.parse(body.toString()) as VersionManifest,
  };
  const first = await listStoredVersions({ ...input, limit: 101 });
  expect(first).toHaveLength(101);
  expect(first[0]!.version).toBe('v0204');
  expect(requests).toHaveLength(3);
  expect(requests[0]!.searchParams.get('fields')).toBe('prefixes,nextPageToken');
  const second = await listStoredVersions({ ...input, limit: 101, before: first[99]!.version });
  expect(second[0]!.version).toBe('v0104');
  const third = await listStoredVersions({ ...input, limit: 101, before: second[99]!.version });
  expect(third.map((row) => row.version)).toEqual(['v0004', 'v0003', 'v0002', 'v0001']);
  const complete = [...first.slice(0, 100), ...second.slice(0, 100), ...third];
  expect(new Set(complete.map((row) => row.version)).size).toBe(204);
  expect(reads.length).toBeLessThan(600);
});

describe('storage pagination failures', () => {
  it('rejects repeated storage tokens instead of hanging', async () => {
    await expect(
      listStoredVersions({
        slug: 'probe',
        bucket: 'bucket',
        limit: 1,
        getAccessToken: async () => 'fixture',
        fetchImpl: async () => Response.json({ nextPageToken: 'same' }),
        readObject: async () => null,
        parse: () => ({}) as VersionManifest,
      }),
    ).rejects.toThrow('repeated a history page token');
  });
});

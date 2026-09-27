import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import type { GamesStore, VersionManifest } from '../delivery/games-store.js';
import { resolveProposalBase } from './proposal-base.js';
import { InMemoryStore } from '../platform/store.js';

const BLOCK = 512;
const SOURCES = { 'game.ts': 'export {};', 'EDITOR.json': '{"version":2}', 'EDITOR.ts': 'export default {};' };

function tarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) => {
    const payload = Buffer.from(body, 'utf8');
    const header = Buffer.alloc(BLOCK);
    header.write(`gamedevpl-games-abc/${name}`, 0, 100, 'utf8');
    header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    return Buffer.concat([header, payload, Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK)]);
  });
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}

it('drops a legacy EDITOR.ts from a repo-lane base', async () => {
  const archive = tarball(Object.fromEntries(Object.entries(SOURCES).map(([path, body]) => [`games/g/${path}`, body])));
  const result = await resolveProposalBase(
    {
      store: new InMemoryStore(),
      snapshotStore: { getPointer: async () => ({ snapshotId: 's1', commitSha: 'abc' }) } as never,
      gamesRepo: 'owner/repo',
      gamesRepoToken: 'token',
      fetchImpl: (async () => new Response(new Uint8Array(archive))) as unknown as typeof fetch,
    },
    'g',
  );
  expect(result.files.map((file) => file.path).sort()).toEqual(['EDITOR.json', 'game.ts']);
});

it('drops a legacy EDITOR.ts from a store-lane base', async () => {
  const store = new InMemoryStore();
  await store.setPublication({
    slug: 'g',
    state: 'published',
    currentVersion: 'v1',
    publishedAt: '2026-08-04T12:00:00Z',
  });
  const gamesStore = {
    getManifest: async () => ({ sourceFiles: Object.keys(SOURCES) }) as VersionManifest,
    getSourceFile: async (_slug: string, _version: string, path: string) => SOURCES[path as keyof typeof SOURCES],
  } as unknown as GamesStore;
  const result = await resolveProposalBase({ store, gamesStore }, 'g');
  expect(result.files.map((file) => file.path).sort()).toEqual(['EDITOR.json', 'game.ts']);
});

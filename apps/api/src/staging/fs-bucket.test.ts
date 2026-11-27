import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGcsGamesStore } from '../delivery/games-store.js';
import { createFsBucket } from './fs-bucket.js';

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function bucket() {
  root = await mkdtemp(path.join(tmpdir(), 'fs-bucket-'));
  return createFsBucket({ root, publicBaseUrl: () => 'https://tunnel.example', secret: 's' });
}

const upload = (name: string, match?: number) =>
  `https://storage.googleapis.com/upload/storage/v1/b/b/o?uploadType=media&name=${encodeURIComponent(name)}` +
  (match === undefined ? '' : `&ifGenerationMatch=${match}`);
const object = (name: string, media = true) =>
  `https://storage.googleapis.com/storage/v1/b/b/o/${encodeURIComponent(name)}${media ? '?alt=media' : ''}`;

describe('fs bucket', () => {
  it('reads back writes with generations and honours ifGenerationMatch', async () => {
    const b = await bucket();
    expect((await b.fetch(upload('a/b.json', 0), { method: 'POST', body: Buffer.from('one') })).status).toBe(200);
    expect((await b.fetch(upload('a/b.json', 0), { method: 'POST', body: Buffer.from('two') })).status).toBe(412);
    const read = await b.fetch(object('a/b.json'));
    expect(await read.text()).toBe('one');
    const generation = Number(read.headers.get('x-goog-generation'));
    expect((await b.fetch(upload('a/b.json', generation), { method: 'POST', body: Buffer.from('two') })).status).toBe(
      200,
    );
    expect((await b.fetch(object('a/b.json'))).status).toBe(200);
    expect((await b.fetch(object('missing'))).status).toBe(404);
    expect((await b.fetch(object('a/b.json'), { method: 'DELETE' })).status).toBe(204);
    expect(await b.objectStore.objectExists('a/b.json')).toBe(false);
  });

  it('lets only one of two racing create-only uploads win', async () => {
    const b = await bucket();
    const statuses = await Promise.all(
      ['one', 'two'].map((body) => b.fetch(upload('race.json', 0), { method: 'POST', body: Buffer.from(body) })),
    );
    expect(statuses.map((r) => r.status).sort()).toEqual([200, 412]);
  });

  it('never pairs an old body with a newer generation', async () => {
    const b = await bucket();
    await b.fetch(upload('m.json', 0), { method: 'POST', body: Buffer.from('old') });
    const [read] = await Promise.all([
      b.fetch(object('m.json')),
      b.fetch(upload('m.json', 1), { method: 'POST', body: Buffer.from('new') }),
    ]);
    const body = await read.text();
    expect(read.headers.get('x-goog-generation')).toBe(body === 'old' ? '1' : '2');
  });

  it('lists prefixes the way version history reads them', async () => {
    const b = await bucket();
    for (const name of ['games/x/versions/v1/manifest.json', 'games/x/versions/v2/manifest.json', 'games/x/top.json']) {
      await b.fetch(upload(name), { method: 'POST', body: Buffer.from('{}') });
    }
    const listing = await b
      .fetch('https://storage.googleapis.com/storage/v1/b/b/o?prefix=games%2Fx%2Fversions%2F&delimiter=%2F')
      .then((r) => r.json());
    expect(listing.prefixes).toEqual(['games/x/versions/v1/', 'games/x/versions/v2/']);
  });

  it('refuses names that escape the root and signs read URLs it can verify', async () => {
    const b = await bucket();
    await expect(b.fetch(object('../outside'))).rejects.toThrow(/escapes/);
    const url = new URL(await b.objectStore.signReadUrl('kits/abc.tgz'));
    expect(url.origin).toBe('https://tunnel.example');
    expect(b.verifyReadUrl('kits/abc.tgz', url.searchParams.get('sig')!, url.searchParams.get('expires')!)).toBe(true);
    expect(b.verifyReadUrl('kits/other.tgz', url.searchParams.get('sig')!, url.searchParams.get('expires')!)).toBe(
      false,
    );
  });

  it('backs a games store end to end', async () => {
    const b = await bucket();
    const store = createGcsGamesStore({ bucket: 'b', fetchImpl: b.fetch, getAccessToken: async () => 't' });
    expect(await store.getManifest('some-game', 'v1')).toBeNull();
    expect(await store.listVersions('some-game')).toEqual([]);
  });
});

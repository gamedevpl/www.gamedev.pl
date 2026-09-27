import { expect, it } from 'vitest';
import { createGcsGamesStore } from './games-store.js';

function stubGcs() {
  const objects = new Map<string, Buffer>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const name = decodeURIComponent(new URL(href).searchParams.get('name') ?? '');
      objects.set(name, Buffer.from(init.body as Uint8Array));
      return new Response(JSON.stringify({ generation: '1' }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    if (init.method === 'DELETE') {
      objects.delete(name);
      return new Response(null, { status: 200 });
    }
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    return new Response(new Uint8Array(body), { status: 200, headers: { 'x-goog-generation': '1' } });
  }) as unknown as typeof fetch;
  return { impl };
}

function storeWith(fetchImpl: typeof fetch) {
  return createGcsGamesStore({
    bucket: 'b',
    getAccessToken: async () => 'token',
    now: () => Date.parse('2026-07-30T10:00:00Z'),
    fetchImpl,
  });
}

it('tombstones a retired EDITOR.ts but still refuses staging it', async () => {
  const store = storeWith(stubGcs().impl);
  const at = { slug: 'g', jobId: 7, roundGeneration: 1, path: 'EDITOR.ts' };

  await expect(store.putStagedSourceFile({ ...at, content: 'export default {};' })).rejects.toThrow(
    /compiled EDITOR\.json only/,
  );
  const deleted = await store.deleteStagedSourceFile(at);
  expect(deleted.path).toBe('EDITOR.ts');
  const assembled = await store.getStagedSourceFiles({ slug: 'g', jobId: 7, roundGeneration: 1 });
  expect(assembled).toEqual([{ path: 'EDITOR.ts', content: '', deleted: true }]);
});

it('hides a legacy EDITOR.ts from stored manifests so no copy carries it forward', async () => {
  const { impl } = stubGcs();
  const store = storeWith(impl);
  const manifest = {
    slug: 'g',
    version: 'v1',
    createdAt: '2026-07-30T10:00:00Z',
    jobId: 1,
    sourceFiles: ['game.ts', 'EDITOR.ts'],
  };
  await impl('https://storage/upload?name=' + encodeURIComponent('games/g/versions/v1/manifest.json'), {
    method: 'POST',
    body: new TextEncoder().encode(JSON.stringify(manifest)),
  });
  expect((await store.getManifest('g', 'v1'))?.sourceFiles).toEqual(['game.ts']);
});

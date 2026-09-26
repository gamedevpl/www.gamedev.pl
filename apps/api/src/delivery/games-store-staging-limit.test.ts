import { describe, expect, it } from 'vitest';
import { createGcsGamesStore, MAX_UPLOAD_FILES } from './games-store.js';

function stagingGcs() {
  const objects = new Map<string, Buffer>();
  let generation = 0;
  return (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      const ifMatch = Number(parsed.searchParams.get('ifGenerationMatch'));
      if (ifMatch !== generation) return new Response('Precondition Failed', { status: 412 });
      objects.set(name, Buffer.from(init.body as Uint8Array));
      generation++;
      return new Response('{}', { status: 200 });
    }
    if (init.method === 'DELETE') return new Response(null, { status: 200 });
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'x-goog-generation': String(generation) },
    });
  }) as typeof fetch;
}

describe('staged source limits', () => {
  it('counts tombstones toward the staged file limit', async () => {
    const store = createGcsGamesStore({
      bucket: 'b',
      getAccessToken: async () => 'token',
      fetchImpl: stagingGcs(),
    });

    for (let index = 0; index < MAX_UPLOAD_FILES; index++) {
      await store.deleteStagedSourceFile({
        slug: 'g',
        jobId: 7,
        roundGeneration: 1,
        path: `game/deleted-${index}.ts`,
      });
    }

    await expect(
      store.deleteStagedSourceFile({
        slug: 'g',
        jobId: 7,
        roundGeneration: 1,
        path: 'game/one-too-many.ts',
      }),
    ).rejects.toThrow(`too many staged files: ${MAX_UPLOAD_FILES + 1} > ${MAX_UPLOAD_FILES}`);

    const listed = await store.listStagedSources({ slug: 'g', jobId: 7, roundGeneration: 1 });
    expect(listed.files).toHaveLength(MAX_UPLOAD_FILES);
  });
});

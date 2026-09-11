import { expect, it } from 'vitest';
import { createGcsGamesStore } from './games-store.js';
const base = { bucket: 'b', getAccessToken: async () => 'token', now: () => Date.parse('2026-07-30T10:00:00Z') };

it.each([412, 429])('retries manifest writes after %i without losing concurrent files', async (firstStatus) => {
  const objects = new Map<string, Buffer>();
  const generations = new Map<string, number>();
  let manifestWrites = 0;
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      if (name.endsWith('/manifest.json')) {
        manifestWrites += 1;
        // First attempt pretends another writer landed first.
        if (manifestWrites === 1) {
          objects.set(
            name,
            Buffer.from(
              JSON.stringify({
                slug: 'g',
                jobId: 7,
                roundGeneration: 1,
                updatedAt: '2026-07-30T10:00:00.000Z',
                files: [{ path: 'SPEC.md', bytes: 3 }],
                totalBytes: 3,
              }),
            ),
          );
          generations.set(name, 1);
          return new Response('Retry', { status: firstStatus });
        }
      }
      const ifMatch = parsed.searchParams.get('ifGenerationMatch');
      const current = generations.get(name) ?? 0;
      if (ifMatch !== null && Number(ifMatch) !== current) {
        return new Response('Precondition Failed', { status: 412 });
      }
      objects.set(name, Buffer.from(init.body as Uint8Array));
      const next = current + 1;
      generations.set(name, next);
      return new Response('{}', { status: 200 });
    }
    if (init.method === 'DELETE') {
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      objects.delete(name);
      generations.delete(name);
      return new Response(null, { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    // After the first 412, the concurrent writer's manifest appears for the retry read.
    if (name.endsWith('/manifest.json') && manifestWrites >= 1 && !objects.has(name)) {
      const concurrent = {
        slug: 'g',
        jobId: 7,
        roundGeneration: 1,
        updatedAt: '2026-07-30T10:00:00.000Z',
        files: [{ path: 'SPEC.md', bytes: 3 }],
        totalBytes: 3,
      };
      objects.set(name, Buffer.from(JSON.stringify(concurrent)));
      generations.set(name, 1);
    }
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'x-goog-generation': String(generations.get(name) ?? 1) },
    });
  }) as unknown as typeof fetch;

  const store = createGcsGamesStore({ ...base, fetchImpl: impl });
  const result = await store.putStagedSourceFile({
    slug: 'g',
    jobId: 7,
    roundGeneration: 1,
    path: 'game.ts',
    content: 'export {};',
  });

  expect(manifestWrites).toBeGreaterThanOrEqual(2);
  expect(result.files.map((f) => f.path).sort()).toEqual(['SPEC.md', 'game.ts']);
});

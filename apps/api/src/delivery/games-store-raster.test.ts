import { describe, expect, it } from 'vitest';
import { createGcsGamesStore, InvalidUploadError, validateSourceUpload, type SourceFile } from './games-store.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_PNG_B64 = TINY_PNG.toString('base64');
const TINY_WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const TINY_WEBP_B64 = TINY_WEBP.toString('base64');

const HOW_TO_PLAY = {
  goal: { en: 'Survive', pl: 'Przetrwaj' },
  hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
};

const MINIMAL: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
  { path: 'game.ts', content: 'export {};' },
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
  { path: 'AGENT.json', content: '{"policy":"capture"}' },
  { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [] }, howToPlay: HOW_TO_PLAY }) },
];

function stubGcs() {
  const objects = new Map<string, Buffer>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      objects.set(name, Buffer.from(init.body as Uint8Array));
      return new Response(JSON.stringify({ generation: '1' }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    return new Response(new Uint8Array(body), { status: 200, headers: { 'x-goog-generation': '1' } });
  }) as unknown as typeof fetch;
  return { impl, objects };
}

describe('validateSourceUpload rasters', () => {
  it('accepts quantized rasters under scenes/, cast/, or images/', () => {
    expect(
      validateSourceUpload([...MINIMAL, { path: 'scenes/glade/bg.png', content: TINY_PNG_B64 }]).map(
        (file) => file.path,
      ),
    ).toContain('scenes/glade/bg.png');
    expect(
      validateSourceUpload([...MINIMAL, { path: 'cast/jack/atlas.webp', content: TINY_WEBP_B64 }]).map(
        (file) => file.path,
      ),
    ).toContain('cast/jack/atlas.webp');
  });

  it('refuses a raster whose bytes are not a PNG or WebP', () => {
    expect(() =>
      validateSourceUpload([
        ...MINIMAL,
        { path: 'scenes/glade/bg.png', content: Buffer.from('fake-png-bytes').toString('base64') },
      ]),
    ).toThrow(/is not a PNG/);
  });

  it('still refuses a loose PNG in the game root', () => {
    expect(() => validateSourceUpload([...MINIMAL, { path: 'hero.png', content: 'png' }])).toThrow(/not deliverable/);
  });
});

describe('GCS games store rasters', () => {
  it('stores raster sources as raw PNG bytes and reads them back as base64', async () => {
    const { impl, objects } = stubGcs();
    const store = createGcsGamesStore({
      bucket: 'b',
      getAccessToken: async () => 'token',
      now: () => Date.parse('2026-07-30T10:00:00Z'),
      fetchImpl: impl,
    });

    const { version } = await store.putCandidateSources({
      slug: 'g',
      jobId: 1,
      files: [...MINIMAL, { path: 'scenes/glade/bg.png', content: TINY_PNG_B64 }],
    });

    const stored = objects.get(`games/g/versions/${version}/source/scenes/glade/bg.png`);
    expect(stored).toEqual(TINY_PNG);
    await expect(store.getSourceFile('g', version, 'scenes/glade/bg.png')).resolves.toBe(TINY_PNG_B64);
  });
});

describe('validateSourceUpload raster errors', () => {
  it('surfaces InvalidUploadError for a bad raster path', () => {
    expect(() => validateSourceUpload([...MINIMAL, { path: 'hero.png', content: 'png' }])).toThrow(InvalidUploadError);
  });
});

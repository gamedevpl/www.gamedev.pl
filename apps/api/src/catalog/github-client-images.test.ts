import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from './github-client.js';

const repo = 'gamedevpl/www.gamedev.pl-games';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function specMd(frontmatter: Record<string, string>): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---', '', '## Concept', 'A game.'].join('\n');
}

function contentsFetch(files: Map<string, string | Uint8Array>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    const marker = '/contents/';
    const path = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
    const value = files.get(path);
    return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
  }) as unknown as typeof fetch;
}

function paintedFiles(extra: Record<string, string | Uint8Array> = {}): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['games/painted/index.html', '<canvas id="game"></canvas>'],
    ['games/painted/game.ts', 'GameKit.mount({ ok: true });'],
    ['games/painted/style.css', '.game {}'],
    ['games/painted/SPEC.md', specMd({ title: 'Painted' })],
    ['shared/game-shell.css', '.shell {}'],
    ['shared/modules/core.ts', 'window.GameKit = { mount() {} };'],
    ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
    ...Object.entries(extra),
  ]);
}

describe('getGameSources images', () => {
  it('embeds GAME.json images as data URIs and prepends the decode loading screen', async () => {
    const files = paintedFiles({
      'games/painted/style.css': '.game { color: moss; }',
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input', 'audio'] },
        audio: { sounds: ['ui-toggle'], music: 'calm-theme' },
        images: { 'glade-bg': 'scenes/glade/bg.png' },
      }),
      'games/painted/scenes/glade/bg.png': TINY_PNG,
      'shared/modules/audio.ts': 'GameKit.createAudio = function (): void {};',
      'shared/audio/assets/ui-toggle.wav': new Uint8Array([1, 2]),
      'shared/audio/music.json': JSON.stringify({
        tracks: { 'calm-theme': { loop: true, data: 'data:audio/mpeg;base64,AAA=' } },
      }),
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    const sources = await client.getGameSources('main', 'painted');
    const expected = `data:image/png;base64,${TINY_PNG.toString('base64')}`;
    expect(sources?.gameJs).toContain('window.__GAME_IMAGE_ASSETS__ = Object.freeze(');
    expect(sources?.gameJs).toContain(JSON.stringify(expected));
    expect(sources?.gameJs).toContain('window.__GAME_IMAGE_ELEMENTS__');
    expect(sources?.gameJs).toContain('window.__GAME_IMAGE_PROGRESS__');
    expect(sources?.indexHtml).toContain('id="gk-load"');
    expect(sources?.indexHtml).toContain('<canvas id="game"></canvas>');
  });

  it('refuses a GAME.json image whose path is not under scenes/, cast/, or images/', async () => {
    const files = paintedFiles({
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input'] },
        images: { leak: 'media/opening.png' },
      }),
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    await expect(client.getGameSources('main', 'painted')).rejects.toThrow(/must be under scenes/);
  });

  it('refuses a GAME.json image larger than the per-file quantized cap', async () => {
    const files = paintedFiles({
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input'] },
        images: { bg: 'scenes/glade/bg.png' },
      }),
      'games/painted/scenes/glade/bg.png': new Uint8Array(400 * 1024 + 1),
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    await expect(client.getGameSources('main', 'painted')).rejects.toThrow(/quantized PNG\/WebP must stay under/);
  });

  it('refuses a GAME.json image whose bytes are not a PNG or WebP', async () => {
    const files = paintedFiles({
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input'] },
        images: { bg: 'scenes/glade/bg.png' },
      }),
      'games/painted/scenes/glade/bg.png': new Uint8Array([1, 2, 3, 4]),
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    await expect(client.getGameSources('main', 'painted')).rejects.toThrow(/is not a PNG \(missing signature\)/);
  });

  it('refuses a JPEG even when the GAME.json path ends in .png', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const files = paintedFiles({
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input'] },
        images: { bg: 'scenes/glade/bg.png' },
      }),
      'games/painted/scenes/glade/bg.png': jpeg,
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    await expect(client.getGameSources('main', 'painted')).rejects.toThrow(/is a JPEG, not a PNG/);
  });

  it('bakes a candidate overlay raster and does not fall back to the ref', async () => {
    const published = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]);
    const files = paintedFiles({
      'games/painted/GAME.json': JSON.stringify({
        engine: { modules: ['input'] },
        images: { bg: 'scenes/glade/bg.png' },
      }),
      'games/painted/scenes/glade/bg.png': published,
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    const sources = await client.getGameSources(
      'main',
      'painted',
      {
        'game.ts': 'GameKit.mount({ ok: true });',
        'GAME.json': JSON.stringify({
          engine: { modules: ['input'] },
          images: { bg: 'scenes/glade/bg.png' },
        }),
        'index.html': '<canvas id="game"></canvas>',
        'style.css': '.game {}',
        'SPEC.md': specMd({ title: 'Painted' }),
        'scenes/glade/bg.png': TINY_PNG.toString('base64'),
      },
      { noRefFallback: true },
    );
    const expected = `data:image/png;base64,${TINY_PNG.toString('base64')}`;
    expect(sources?.gameJs).toContain(JSON.stringify(expected));
    expect(sources?.gameJs).not.toContain(Buffer.from(published).toString('base64'));
  });

  it('refuses a missing candidate raster when noRefFallback is set', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['shared/game-shell.css', '.shell {}'],
      ['shared/modules/core.ts', 'window.GameKit = { mount() {} };'],
      ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
    ]);
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    await expect(
      client.getGameSources(
        'main',
        'painted',
        {
          'game.ts': 'GameKit.mount({ ok: true });',
          'GAME.json': JSON.stringify({
            engine: { modules: ['input'] },
            images: { bg: 'scenes/glade/bg.png' },
          }),
          'index.html': '<canvas id="game"></canvas>',
          'style.css': '.game {}',
          'SPEC.md': specMd({ title: 'Painted' }),
        },
        { noRefFallback: true },
      ),
    ).rejects.toThrow(/not found: scenes\/glade\/bg.png/);
  });
});

describe('getGameDeliverySources images', () => {
  it('includes declared rasters as base64 file bytes', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/painted/game.ts', 'GameKit.mount({ ok: true });\n'],
      ['games/painted/SPEC.md', '---\ntitle: Painted\n---\n'],
      ['games/painted/index.html', '<canvas></canvas>'],
      ['games/painted/style.css', 'body{}'],
      [
        'games/painted/GAME.json',
        JSON.stringify({
          engine: { modules: [] },
          images: { bg: 'scenes/glade/bg.png' },
        }),
      ],
      ['games/painted/scenes/glade/bg.png', TINY_PNG],
    ]);
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: contentsFetch(files) });
    const sources = await client.getGameDeliverySources('main', 'painted');
    expect(sources?.['scenes/glade/bg.png']).toBe(TINY_PNG.toString('base64'));
  });
});

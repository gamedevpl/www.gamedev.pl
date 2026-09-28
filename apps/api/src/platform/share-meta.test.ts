import { describe, expect, it } from 'vitest';
import type { CatalogGameEntry } from '../catalog/github-client.js';
import {
  createSharePreviewShell,
  injectShareMeta,
  previewScreenshotFile,
  renderShareMeta,
  shareableGameSlug,
} from './share-meta.js';

const SHELL =
  '<!doctype html><html><head><meta charset="UTF-8" /><title>Gamedev.pl — Describe a game, play it</title></head><body></body></html>';

function entry(overrides: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
  return {
    slug: 'biplane-skirmish',
    title: 'Biplane Skirmish',
    genre: 'Flight combat',
    controls: '',
    status: 'published',
    media: {
      screenshots: [
        { name: 'opening', file: 'opening.png' },
        { name: 'combat', file: 'combat.png' },
      ],
      video: 'gameplay.mp4',
    },
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'landscape',
    submittedBy: null,
    tagline: { en: 'Lead your squadron against the Red Baron.', pl: 'Poprowadź eskadrę.' },
    ...overrides,
  } as CatalogGameEntry;
}

describe('shareableGameSlug', () => {
  it('reads the slug from play links and game pages', () => {
    expect(shareableGameSlug('/play/biplane-skirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/play/biplane-skirmish?via=share')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/gtanczyk/biplane-skirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/gtanczyk/biplane-skirmish/releases')).toBe('biplane-skirmish');
  });

  it('ignores every other path', () => {
    expect(shareableGameSlug('/')).toBeNull();
    expect(shareableGameSlug('/gtanczyk')).toBeNull();
    expect(shareableGameSlug('/play/Bad_Slug')).toBeNull();
    expect(shareableGameSlug('/studio/abc/build')).toBeNull();
    expect(shareableGameSlug('/studio/abc')).toBeNull();
    expect(shareableGameSlug('/gamedevpl/biplane-skirmish')).toBe('biplane-skirmish');
  });
});

describe('renderShareMeta', () => {
  it('describes the game with an absolute gameplay screenshot', () => {
    const meta = renderShareMeta({
      entry: entry(),
      origin: 'https://www.gamedev.pl',
      pathname: '/play/biplane-skirmish?x=1',
    });
    expect(meta.title).toBe('Biplane Skirmish — gamedev.pl');
    expect(meta.tags).toContain(
      '<meta property="og:image" content="https://www.gamedev.pl/api/games/biplane-skirmish/media/combat.png" />',
    );
    expect(meta.tags).toContain('<meta property="og:url" content="https://www.gamedev.pl/play/biplane-skirmish" />');
    expect(meta.tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(meta.tags).toContain('content="Lead your squadron against the Red Baron."');
  });

  it('escapes agent-authored text', () => {
    const meta = renderShareMeta({
      entry: entry({ title: '"><script>alert(1)</script>', tagline: null }),
      origin: 'https://www.gamedev.pl',
      pathname: '/play/biplane-skirmish',
    });
    expect(meta.tags).not.toContain('<script>');
    expect(meta.tags).toContain('&quot;&gt;&lt;script&gt;');
    expect(meta.tags).toContain('content="Flight combat · play in your browser"');
  });

  it('falls back to a small card when there is no screenshot', () => {
    const meta = renderShareMeta({
      entry: entry({ media: null }),
      origin: 'https://x',
      pathname: '/play/biplane-skirmish',
    });
    expect(meta.tags).toContain('<meta name="twitter:card" content="summary" />');
    expect(meta.tags).not.toContain('og:image');
  });
});

describe('previewScreenshotFile', () => {
  it('prefers a gameplay capture, then the first one', () => {
    expect(previewScreenshotFile(entry())).toBe('combat.png');
    expect(
      previewScreenshotFile(entry({ media: { screenshots: [{ name: 'opening', file: 'o.png' }], video: null } })),
    ).toBe('o.png');
  });
});

describe('injectShareMeta', () => {
  it('replaces the shell title and keeps the rest', () => {
    const html = injectShareMeta(SHELL, { title: 'A & B', tags: '<meta name="x" content="y" />' });
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html).toContain('<meta name="x" content="y" />');
    expect(html).not.toContain('Describe a game, play it');
    expect(html).toContain('<meta charset="UTF-8" />');
  });

  it('does not treat $ in values as a replacement pattern', () => {
    const html = injectShareMeta(SHELL, { title: 'Cash $& Carry', tags: '' });
    expect(html).toContain('<title>Cash $&amp; Carry</title>');
  });
});

describe('createSharePreviewShell', () => {
  const request = { url: '/play/biplane-skirmish', host: 'localhost:8080', protocol: 'http' };

  it('previews a shareable published game', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => true,
      canonicalHost: 'www.gamedev.pl',
    });
    const html = await shell(request);
    expect(html).toContain('<title>Biplane Skirmish — gamedev.pl</title>');
    expect(html).toContain('https://www.gamedev.pl/api/games/biplane-skirmish/media/combat.png');
  });

  it('uses the request origin without a canonical host', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => true,
    });
    expect(await shell(request)).toContain('http://localhost:8080/api/games/biplane-skirmish/media/combat.png');
  });

  it('says nothing about games a stranger cannot open', async () => {
    let looked = false;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        looked = true;
        return entry();
      },
      isShareable: async () => false,
    });
    expect(await shell(request)).toBeNull();
    expect(looked).toBe(false);
  });

  it('falls back to the plain shell for unknown games, other paths and failures', async () => {
    const missing = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => null,
      isShareable: async () => true,
    });
    expect(await missing(request)).toBeNull();
    expect(await missing({ ...request, url: '/' })).toBeNull();

    const failing = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        throw new Error('catalog down');
      },
      isShareable: async () => true,
    });
    expect(await failing(request)).toBeNull();
  });
});

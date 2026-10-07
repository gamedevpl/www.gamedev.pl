import { describe, expect, it } from 'vitest';
import type { CatalogGameEntry } from '../catalog/github-client.js';
import {
  GAME_NOT_FOUND,
  GAME_WALLED,
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
    expect(shareableGameSlug('/play/biplane%2Dskirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/ay/biplane-skirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/draft/biplane-skirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/gtanczyk/biplane-skirmish')).toBe('biplane-skirmish');
    expect(shareableGameSlug('/gtanczyk/biplane-skirmish/releases')).toBe('biplane-skirmish');
  });

  it('ignores every other path', () => {
    expect(shareableGameSlug('/')).toBeNull();
    expect(shareableGameSlug('/gtanczyk')).toBeNull();
    expect(shareableGameSlug('/play/Bad_Slug')).toBeNull();
    expect(shareableGameSlug('/play/%E0%A4%A')).toBeNull();
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
    });
    expect(meta.tags).not.toContain('<script>');
    expect(meta.tags).toContain('&quot;&gt;&lt;script&gt;');
    expect(meta.tags).toContain('content="Flight combat · play in your browser"');
  });

  it('falls back to a small card when there is no screenshot', () => {
    const meta = renderShareMeta({
      entry: entry({ media: null }),
      origin: 'https://x',
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
  const request = { url: '/play/biplane-skirmish' };

  it('previews a shareable published game', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => true,
    });
    const html = await shell(request);
    expect(html).toContain('<title>Biplane Skirmish — gamedev.pl</title>');
    expect(html).toContain('https://www.gamedev.pl/api/games/biplane-skirmish/media/combat.png');
  });

  it('uses the configured origin, never the request host', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => true,
      origin: 'https://staging.example',
    });
    expect(await shell(request)).toContain('https://staging.example/api/games/biplane-skirmish/media/combat.png');
    expect(await shell({ url: '/oldowner/biplane-skirmish' })).toContain(
      '<meta property="og:url" content="https://staging.example/play/biplane-skirmish" />',
    );
  });

  it('caches previews per slug for a short window', async () => {
    let lookups = 0;
    let clock = 0;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        lookups += 1;
        return entry();
      },
      isShareable: async () => true,
      now: () => clock,
    });
    await shell(request);
    await shell({ url: '/draft/biplane-skirmish' });
    expect(lookups).toBe(1);
    clock = 60_001;
    await shell(request);
    expect(lookups).toBe(2);
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

  it('marks walled games for noindex without looking them up', async () => {
    let looked = false;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        looked = true;
        return null;
      },
      isShareable: async () => false,
      isPastWall: async () => false,
    });
    expect(await shell(request)).toBe(GAME_WALLED);
    expect(await shell({ url: '/play/does-not-exist' })).toBe(GAME_WALLED);
    expect(looked).toBe(false);
  });

  it('keeps load-shed games on the plain shell', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => false,
      isPastWall: async () => true,
    });
    expect(await shell(request)).toBeNull();
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

  it('previews a store-lane game from its published SPEC and media', async () => {
    const spec =
      '---\ntitle: Sky Duel\nslug: sky-duel\ngenre: flight\ncontrols: keys\nstatus: published\n---\n\nA duel.\n';
    const media = JSON.stringify({ formatVersion: 1, captures: { combat: { file: 'combat.png', frame: 1 } } });
    let repoLooked = false;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        repoLooked = true;
        return null;
      },
      isShareable: async () => true,
      store: {
        getPublication: async () => ({ slug: 'sky-duel', state: 'published', currentVersion: 'v3' }),
        listCatalogEnrichments: async () => [{ slug: 'sky-duel', tagline: { en: 'Duel over the clouds.' } }],
      } as never,
      gamesStore: {
        getSourceFile: async (_slug, version, file) => (version === 'v3' && file === 'SPEC.md' ? spec : null),
        getDerivedArtifact: async (_slug, _version, file) =>
          file === 'media/metadata.json' ? Buffer.from(media) : null,
      } as never,
    });
    const html = await shell({ ...request, url: '/play/sky-duel' });
    expect(html).toContain('<title>Sky Duel — gamedev.pl</title>');
    expect(html).toContain('<meta property="og:description" content="Duel over the clouds." />');
    expect(repoLooked).toBe(true);
  });

  it('caps storage lookups per minute however many slugs are tried', async () => {
    let lookups = 0;
    let clock = 0;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async (slug) => (slug === 'biplane-skirmish' ? entry() : null),
      isShareable: async () => true,
      now: () => clock,
      store: {
        getPublication: async () => {
          lookups += 1;
          return null;
        },
        listCatalogEnrichments: async () => [],
      } as never,
      gamesStore: {} as never,
    });
    for (let i = 0; i < 300; i += 1) await shell({ url: `/play/missing-${i}` });
    expect(lookups).toBe(60);
    // Repo-catalog games still preview once the budget is spent.
    expect(await shell(request)).toContain('<title>Biplane Skirmish — gamedev.pl</title>');
    clock = 60_000;
    await shell({ url: '/play/missing-300' });
    expect(lookups).toBe(61);
  });

  it('falls back to the store when the repo catalog fails', async () => {
    const spec = '---\ntitle: Sky Duel\nslug: sky-duel\ngenre: flight\ncontrols: keys\nstatus: published\n---\n';
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        throw new Error('catalog down');
      },
      isShareable: async () => true,
      store: {
        getPublication: async () => ({ slug: 'sky-duel', state: 'published', currentVersion: 'v1' }),
        listCatalogEnrichments: async () => [],
      } as never,
      gamesStore: {
        getSourceFile: async () => spec,
        getDerivedArtifact: async () => null,
      } as never,
    });
    expect(await shell({ url: '/play/sky-duel' })).toContain('<title>Sky Duel — gamedev.pl</title>');
  });

  it('shares one render between concurrent requests for a slug', async () => {
    let lookups = 0;
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => {
        lookups += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return entry();
      },
      isShareable: async () => true,
    });
    const pages = await Promise.all(Array.from({ length: 10 }, () => shell(request)));
    expect(lookups).toBe(1);
    expect(pages.every((html) => html?.includes('Biplane Skirmish'))).toBe(true);
  });

  it('prefers the repo entry when both lanes carry the slug', async () => {
    const shell = createSharePreviewShell({
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => entry(),
      isShareable: async () => true,
      store: {
        getPublication: async () => {
          throw new Error('store must not be read for a repo-lane slug');
        },
        listCatalogEnrichments: async () => [],
      } as never,
      gamesStore: {} as never,
    });
    expect(await shell(request)).toContain('<title>Biplane Skirmish — gamedev.pl</title>');
  });

  describe('games no lane publishes', () => {
    const unpublishedStore = {
      getPublication: async () => null,
      listCatalogEnrichments: async () => [],
    } as never;

    it('reports them as not found so the shell boots with a real 404', async () => {
      const shell = createSharePreviewShell({
        readIndexHtml: async () => SHELL,
        getCatalogEntry: async () => null,
        isShareable: async () => true,
        store: unpublishedStore,
        gamesStore: {} as never,
      });
      expect(await shell({ url: '/play/gone-game' })).toBe(GAME_NOT_FOUND);
      expect(await shell({ url: '/someone/gone-game' })).toBe(GAME_NOT_FOUND);
    });

    it('keeps draft links on the plain shell', async () => {
      const shell = createSharePreviewShell({
        readIndexHtml: async () => SHELL,
        getCatalogEntry: async () => null,
        isShareable: async () => true,
        store: unpublishedStore,
        gamesStore: {} as never,
      });
      expect(await shell({ url: '/draft/gone-game' })).toBeNull();
    });

    it('never calls a game missing when the repo catalog failed to answer', async () => {
      const shell = createSharePreviewShell({
        readIndexHtml: async () => SHELL,
        getCatalogEntry: async () => {
          throw new Error('catalog down');
        },
        isShareable: async () => true,
        store: unpublishedStore,
        gamesStore: {} as never,
      });
      expect(await shell({ url: '/play/gone-game' })).toBeNull();
    });

    it('never calls a game missing once the storage budget is spent', async () => {
      const shell = createSharePreviewShell({
        readIndexHtml: async () => SHELL,
        getCatalogEntry: async () => null,
        isShareable: async () => true,
        now: () => 0,
        store: unpublishedStore,
        gamesStore: {} as never,
      });
      for (let i = 0; i < 60; i += 1) expect(await shell({ url: `/play/gone-${i}` })).toBe(GAME_NOT_FOUND);
      expect(await shell({ url: '/play/gone-60' })).toBeNull();
    });
  });
});

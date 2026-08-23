import { describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { VARIANT_WIDTHS } from '../platform/image-variants.js';
import { publishSnapshot } from './game-snapshot-publish.js';
import type { GameSnapshotWriter, SnapshotGame, SnapshotMedia, SnapshotPointer } from './game-snapshot.js';
import type { CatalogGameEntry, GameSources, GitHubClient } from './github-client.js';

const ref = 'main';

function catalogEntry(slug: string, overrides: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
  return {
    slug,
    title: slug,
    genre: 'arcade',
    controls: 'arrows',
    status: 'published',
    media: null,
    multiplayer: null,
    ...overrides,
  };
}

function gameSources(overrides: Partial<GameSources> = {}): GameSources {
  return {
    indexHtml: '<canvas id="game"></canvas>',
    gameJs: 'console.log("play")',
    styleCss: 'body{margin:0}',
    title: null,
    ...overrides,
  };
}

function createClientStub(params: {
  catalog: CatalogGameEntry[];
  sourcesBySlug?: Record<string, GameSources | null>;
  mediaBySlug?: Record<string, Uint8Array | null>;
}) {
  const getCatalog = vi.fn(async () => params.catalog);
  const getGameSources = vi.fn(async (_ref: string, slug: string) =>
    params.sourcesBySlug ? (params.sourcesBySlug[slug] ?? null) : gameSources(),
  );
  const getGameMedia = vi.fn(async (_ref: string, slug: string) =>
    params.mediaBySlug ? (params.mediaBySlug[slug] ?? null) : new Uint8Array([1, 2, 3]),
  );
  const client = {
    getCatalog,
    getGameSources,
    getGameMedia,
  } as unknown as GitHubClient;
  return { client, getCatalog, getGameSources, getGameMedia };
}

function createWriterSpy() {
  const order: string[] = [];
  const games = new Map<string, SnapshotGame>();
  const media = new Map<string, SnapshotMedia>();
  let catalog: CatalogGameEntry[] | null = null;
  let pointer: SnapshotPointer | null = null;

  const writer: GameSnapshotWriter = {
    async putCatalog(_id, entries) {
      order.push('catalog');
      catalog = entries;
    },
    async putGame(_id, game) {
      order.push(`game:${game.slug}`);
      games.set(game.slug, game);
    },
    async putMedia(_id, slug, filename, value, width) {
      const key = width === undefined ? `${slug}/${filename}` : `${slug}/w${width}/${filename}`;
      order.push(`media:${key}`);
      media.set(key, value);
    },
    async putPointer(value) {
      order.push('pointer');
      pointer = value;
    },
  };

  return {
    writer,
    order,
    games,
    media,
    get catalog() {
      return catalog;
    },
    get pointer() {
      return pointer;
    },
  };
}

const fixedNow = () => new Date('2026-07-27T10:15:00.000Z');

describe('publishSnapshot', () => {
  it('bakes each published game into a self-contained document', async () => {
    const { client } = createClientStub({ catalog: [catalogEntry('bubble-pop')] });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(1);
    const baked = spy.games.get('bubble-pop');
    expect(baked?.html).toContain('<!doctype html>');
    expect(baked?.html).toContain('console.log("play")');
  });

  it('applies the same serve-time policy the play route would have applied', async () => {
    const { client } = createClientStub({ catalog: [catalogEntry('bubble-pop')] });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    const html = spy.games.get('bubble-pop')?.html ?? '';
    // Baking must not quietly drop the network lockdown or the AI Act art. 50(2)
    // provenance marking — that is the whole reason this reuses assembleGameHtml.
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('name="ai-generated"');
  });

  it('prefers the SPEC.md title and falls back to the catalog title', async () => {
    const { client } = createClientStub({
      catalog: [catalogEntry('a', { title: 'Catalog Title' }), catalogEntry('b')],
      sourcesBySlug: { a: gameSources({ title: 'Spec Title' }), b: gameSources() },
    });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(spy.games.get('a')?.title).toBe('Spec Title');
    expect(spy.games.get('b')?.title).toBe('b');
  });

  it('skips games the catalog does not publish', async () => {
    const { client, getGameSources } = createClientStub({
      catalog: [catalogEntry('live'), catalogEntry('gone', { status: 'archived' })],
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(1);
    expect(spy.games.has('gone')).toBe(false);
    expect(getGameSources).not.toHaveBeenCalledWith(ref, 'gone');
  });

  it('copies the media the catalog vouches for', async () => {
    const { client } = createClientStub({
      catalog: [
        catalogEntry('bubble-pop', {
          media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: 'gameplay.mp4' },
        }),
      ],
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.mediaFiles).toBe(2);
    expect(spy.media.get('bubble-pop/opening.png')?.contentType).toBe('image/png');
    expect(spy.media.get('bubble-pop/gameplay.mp4')?.contentType).toBe('video/mp4');
  });

  it('moves the pointer only after every object is durable', async () => {
    const { client } = createClientStub({
      catalog: [
        catalogEntry('bubble-pop', { media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null } }),
      ],
    });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    // Until the pointer moves a half-written snapshot is invisible, so publishing
    // is atomic and the site keeps serving the previous snapshot throughout.
    expect(spy.order.at(-1)).toBe('pointer');
    expect(spy.order).toContain('game:bubble-pop');
    expect(spy.order).toContain('media:bubble-pop/opening.png');
    expect(spy.order).toContain('catalog');
  });

  it('records the ref commit in the pointer for traceability', async () => {
    const { client } = createClientStub({ catalog: [catalogEntry('bubble-pop')] });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, commitSha: 'cafe1234', now: fixedNow });

    expect(spy.pointer).toEqual({
      snapshotId: result.snapshotId,
      commitSha: 'cafe1234',
      publishedAt: '2026-07-27T10:15:00.000Z',
      gameCount: 1,
    });
  });
});

describe('publishSnapshot failure handling', () => {
  it('bakes what it can but does not advance the pointer when anything fails', async () => {
    const { client } = createClientStub({
      catalog: [catalogEntry('good'), catalogEntry('broken')],
      sourcesBySlug: { good: gameSources(), broken: null },
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(1);
    expect(result.failures).toEqual([{ slug: 'broken', reason: 'game sources not found on ref' }]);
    expect(spy.games.has('good')).toBe(true);
    // Without a serve-time GitHub fallback, flipping the pointer on a partial
    // bake would half-publish failed games. Leave current.json where it is.
    expect(spy.pointer).toBeNull();
    expect(spy.order).not.toContain('pointer');
  });

  it('still writes the full catalog under the new id for debugging, without publishing it', async () => {
    const { client } = createClientStub({
      catalog: [catalogEntry('good'), catalogEntry('broken')],
      sourcesBySlug: { good: gameSources(), broken: null },
    });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    // Catalog membership is the games repo's decision, not this job's. The
    // objects are written for debugging, but the pointer stays put so failed
    // games are not half-published and successful ones are not silently dropped.
    expect(spy.catalog?.map((entry) => entry.slug)).toEqual(['good', 'broken']);
    expect(spy.games.has('broken')).toBe(false);
    expect(spy.pointer).toBeNull();
  });

  it('treats a game that fails the hygiene gate as a failure, not a published snapshot', async () => {
    const { client } = createClientStub({
      catalog: [catalogEntry('empty')],
      sourcesBySlug: { empty: gameSources({ gameJs: '   ' }) },
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(0);
    expect(result.failures[0]?.slug).toBe('empty');
    expect(spy.pointer).toBeNull();
  });

  it('carries on when one game is missing a declared media file', async () => {
    const { client } = createClientStub({
      catalog: [
        catalogEntry('bubble-pop', { media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null } }),
      ],
      mediaBySlug: { 'bubble-pop': null },
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(1);
    expect(result.mediaFiles).toBe(0);
    expect(result.failures).toEqual([]);
    expect(spy.pointer).not.toBeNull();
  });

  it('bakes an empty catalog without writing a broken pointer', async () => {
    const { client } = createClientStub({ catalog: [] });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(0);
    expect(spy.catalog).toEqual([]);
    expect(spy.pointer?.gameCount).toBe(0);
  });
});

/**
 * Size variants, baked once at publish rather than resized per request. The arcade
 * shows the same screenshot at ~48 CSS px in the moment strip and a few hundred as a
 * card poster; serving the original for both means every near-fold poster (and each
 * moment thumb after engage) pays for a full-size decode.
 */
describe('publishSnapshot media variants', () => {
  function pngOfWidth(width: number, height: number): Uint8Array {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = i % 255;
      png.data[i + 1] = 40;
      png.data[i + 2] = 90;
      png.data[i + 3] = 255;
    }
    return new Uint8Array(PNG.sync.write(png));
  }

  const withMedia = catalogEntry('bubble-pop', {
    media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: 'gameplay.mp4' },
  });

  it('writes a downscaled copy of each screenshot alongside the original', async () => {
    const { client } = createClientStub({
      catalog: [withMedia],
      mediaBySlug: { 'bubble-pop': pngOfWidth(1280, 720) },
    });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(spy.media.has('bubble-pop/opening.png')).toBe(true);
    for (const width of VARIANT_WIDTHS) {
      const variant = spy.media.get(`bubble-pop/w${width}/opening.png`);
      expect(variant, `w${width}`).toBeDefined();
      expect(PNG.sync.read(variant!.body).width).toBe(width);
      // The whole point: materially fewer bytes than the original.
      expect(variant!.body.byteLength).toBeLessThan(spy.media.get('bubble-pop/opening.png')!.body.byteLength);
    }
  });

  it('leaves video alone — variants are a screenshot idea', async () => {
    const { client } = createClientStub({
      catalog: [withMedia],
      mediaBySlug: { 'bubble-pop': pngOfWidth(1280, 720) },
    });
    const spy = createWriterSpy();

    await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(spy.media.has('bubble-pop/gameplay.mp4')).toBe(true);
    for (const width of VARIANT_WIDTHS) {
      expect(spy.media.has(`bubble-pop/w${width}/gameplay.mp4`)).toBe(false);
    }
  });

  // A screenshot smaller than the target, or bytes that are not a readable PNG, must
  // not fail the bake: the media route falls back to the original, which is what every
  // snapshot baked before variants existed contains.
  it('publishes the game even when no variant can be produced', async () => {
    const { client } = createClientStub({
      catalog: [withMedia],
      mediaBySlug: { 'bubble-pop': new Uint8Array([1, 2, 3]) },
    });
    const spy = createWriterSpy();

    const result = await publishSnapshot({ client, writer: spy.writer, ref, now: fixedNow });

    expect(result.published).toBe(1);
    expect(spy.media.has('bubble-pop/opening.png')).toBe(true);
    expect(spy.media.has('bubble-pop/w96/opening.png')).toBe(false);
  });
});

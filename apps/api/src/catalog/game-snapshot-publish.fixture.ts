import { vi } from 'vitest';
import { gameHtmlHash, type VerifyGameArtifact } from './game-artifact.js';
import type { GameSnapshotWriter, SnapshotGame, SnapshotMedia, SnapshotPointer } from './game-snapshot.js';
import type { CatalogGameEntry, GameSources, GitHubClient } from './github-client.js';

export const ref = 'main';
export const browserProof: VerifyGameArtifact = async (game) => ({
  engineRef: game.engineRef,
  htmlSha256: gameHtmlHash(game.html),
  frames: 6,
});

export function catalogEntry(slug: string, overrides: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
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

export function gameSources(overrides: Partial<GameSources> = {}): GameSources {
  return {
    indexHtml: '<canvas id="game"></canvas>',
    gameJs: 'console.log("play")',
    styleCss: 'body{margin:0}',
    title: null,
    ...overrides,
  };
}

export function createClientStub(params: {
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

export function createWriterSpy() {
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

export const fixedNow = () => new Date('2026-07-27T10:15:00.000Z');

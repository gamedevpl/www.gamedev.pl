import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogIndexer } from './catalog-indexer.js';
import { CatalogVectorIndex } from './catalog-vector-index.js';
import type { VertexEmbeddingService } from './embedding-service.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import type { Store } from '../platform/store.js';

describe('CatalogIndexer', () => {
  let mockEmbeddingService: VertexEmbeddingService;
  let vectorIndex: CatalogVectorIndex;
  let mockGithubClient: GitHubClient;
  let mockStore: Store;

  const mockEntries: CatalogGameEntry[] = [
    {
      slug: 'mexico-86',
      title: "Mexico '86",
      genre: 'Sports',
      controls: 'Arrows',
      status: 'published',
      tagline: { en: 'Arcade football.', pl: 'Turniej piłkarski.' },
      searchKeywords: ['football', 'soccer'],
    },
    {
      slug: 'carjack-city',
      title: 'Carjack City',
      genre: 'Action',
      controls: 'WASD',
      status: 'published',
      tagline: null,
      searchKeywords: null,
    },
    {
      slug: 'draft-game',
      title: 'Draft Game',
      genre: 'Arcade',
      controls: 'Space',
      status: 'building' as unknown as 'published',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vectorIndex = new CatalogVectorIndex();

    mockEmbeddingService = {
      embedText: vi.fn().mockResolvedValue([0.5, 0.5]),
      embedQuery: vi.fn().mockResolvedValue([0.5, 0.5]),
      embedDocument: vi.fn().mockResolvedValue([0.5, 0.5]),
    } as unknown as VertexEmbeddingService;

    mockGithubClient = {
      getGameFile: vi.fn().mockResolvedValue('## SPEC\nGame description'),
    } as unknown as GitHubClient;

    mockStore = {
      getCatalogEnrichments: vi.fn().mockResolvedValue(new Map()),
      setCatalogEnrichment: vi.fn().mockResolvedValue(undefined),
    } as unknown as Store;
  });

  it('builds vector index from published games and skips drafts', async () => {
    const indexer = new CatalogIndexer({
      store: mockStore,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => mockEntries,
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    await indexer.buildIndex();

    expect(vectorIndex.size()).toBe(2);
    expect(mockEmbeddingService.embedDocument).toHaveBeenCalledWith(
      expect.stringContaining("Mexico '86"),
      "Mexico '86",
    );
    expect(mockEmbeddingService.embedDocument).toHaveBeenCalledWith(
      expect.stringContaining('Carjack City'),
      'Carjack City',
    );
  });

  it('purges removed/unpublished games on rebuild via replaceAll', async () => {
    const indexer = new CatalogIndexer({
      store: mockStore,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => [mockEntries[0]!],
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    // Pre-populate with another game
    vectorIndex.upsert({
      slug: 'deleted-game',
      title: 'Deleted Game',
      genre: 'Retro',
      embedding: [0.1, 0.2],
    });
    expect(vectorIndex.size()).toBe(1);

    await indexer.buildIndex();
    expect(vectorIndex.size()).toBe(1);
    expect(vectorIndex.search([0.5, 0.5], 5).some((r) => r.game.slug === 'deleted-game')).toBe(false);
    expect(vectorIndex.search([0.5, 0.5], 5).some((r) => r.game.slug === 'mexico-86')).toBe(true);
  });

  it('filters out games with store enrichments from background SPEC fetch', async () => {
    const storeWithEnrichments = {
      getCatalogEnrichment: vi.fn().mockImplementation(async (slug: string) => {
        if (slug === 'carjack-city') {
          return {
            slug: 'carjack-city',
            tagline: { en: 'Top-down driving.', pl: 'Jazda samochodem.' },
            searchKeywords: ['driving', 'car'],
          };
        }
        return null;
      }),
      setCatalogEnrichment: vi.fn().mockResolvedValue(undefined),
    } as unknown as Store;

    const indexer = new CatalogIndexer({
      store: storeWithEnrichments,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => mockEntries,
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    await indexer.buildIndex();

    // With store enrichments present, getGameFile should not be called.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockGithubClient.getGameFile).not.toHaveBeenCalled();
  });

  it('handles in-flight latch and ensures index without redundant builds', async () => {
    const getEntriesSpy = vi.fn().mockResolvedValue([mockEntries[0]!]);
    const indexer = new CatalogIndexer({
      store: mockStore,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: getEntriesSpy,
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    // First call builds index
    await indexer.ensureIndex();
    expect(getEntriesSpy).toHaveBeenCalledTimes(1);

    // Second immediate call uses cached index
    await indexer.ensureIndex();
    expect(getEntriesSpy).toHaveBeenCalledTimes(1);
  });

  it('prevents concurrent duplicate background enrichments with in-flight latch', async () => {
    let getFileResolve: (content: string) => void = () => {};
    const slowGetGameFile = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          getFileResolve = resolve;
        }),
    );

    const indexer = new CatalogIndexer({
      store: mockStore,
      githubClient: { getGameFile: slowGetGameFile } as unknown as GitHubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => [mockEntries[1]!], // carjack-city (unenriched)
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    // First build triggers background enrichment
    await indexer.buildIndex();
    expect(slowGetGameFile).toHaveBeenCalledTimes(1);

    // In-flight enrichment latch prevents duplicate concurrent passes.
    await indexer.buildIndex();
    expect(slowGetGameFile).toHaveBeenCalledTimes(1);

    // Finish the in-flight enrichment
    getFileResolve('## SPEC\nCar game');
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});

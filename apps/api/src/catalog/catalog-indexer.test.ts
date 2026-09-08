import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogIndexer, computeCatalogDocText, hashCatalogDocText } from './catalog-indexer.js';
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
      modelName: 'gemini-embedding-2',
      embedText: vi.fn().mockResolvedValue([0.5, 0.5]),
      embedQuery: vi.fn().mockResolvedValue([0.5, 0.5]),
      embedDocument: vi.fn().mockResolvedValue([0.5, 0.5]),
    } as unknown as VertexEmbeddingService;

    mockGithubClient = {
      getGameFile: vi.fn().mockResolvedValue('## SPEC\nGame description'),
    } as unknown as GitHubClient;

    mockStore = {
      getCatalogEnrichment: vi.fn().mockResolvedValue(null),
      listCatalogEnrichments: vi.fn().mockResolvedValue([]),
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

  it('backs off a failing rebuild of a non-empty stale index', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const getEntriesSpy = vi.fn().mockImplementation(async () => {
        attempts += 1;
        // Succeed once, then fail every rebuild after it.
        if (attempts === 1) return [mockEntries[0]!];
        throw new Error('catalog unavailable');
      });
      const indexer = new CatalogIndexer({
        store: mockStore,
        githubClient: mockGithubClient,
        publishedRef: 'main',
        getCatalogEntries: getEntriesSpy,
        embeddingService: mockEmbeddingService,
        vectorIndex,
      });

      await indexer.ensureIndex();
      expect(vectorIndex.size()).toBe(1);
      expect(getEntriesSpy).toHaveBeenCalledTimes(1);

      // Let it go stale: now non-empty and stale.
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000);

      await indexer.ensureIndex();
      expect(getEntriesSpy).toHaveBeenCalledTimes(2);

      // Without backoff each request starts another full-catalog pass.
      await indexer.ensureIndex();
      await indexer.ensureIndex();
      await indexer.ensureIndex();
      expect(getEntriesSpy).toHaveBeenCalledTimes(2);

      // Past the window, exactly one more attempt.
      await vi.advanceTimersByTimeAsync(61 * 1000);
      await indexer.ensureIndex();
      expect(getEntriesSpy).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
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

  it('reuses cached embeddings from store without calling embedDocument', async () => {
    const entry = mockEntries[0]!;
    const docText = computeCatalogDocText(entry);
    const docHash = hashCatalogDocText(docText);

    const storeWithEmbedding = {
      listCatalogEnrichments: vi.fn().mockResolvedValue([
        {
          slug: 'mexico-86',
          contentHash: 'hash1',
          tagline: entry.tagline,
          shortControls: { en: 'Arrows', pl: 'Strzałki' },
          searchKeywords: entry.searchKeywords,
          embedding: [0.9, 0.1],
          embeddingDocTextHash: docHash,
          embeddingModel: 'gemini-embedding-2',
          updatedAt: new Date().toISOString(),
        },
      ]),
      getCatalogEnrichment: vi.fn().mockResolvedValue(null),
      setCatalogEnrichment: vi.fn().mockResolvedValue(undefined),
    } as unknown as Store;

    const indexer = new CatalogIndexer({
      store: storeWithEmbedding,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => [entry],
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    await indexer.buildIndex();

    expect(vectorIndex.size()).toBe(1);
    expect(mockEmbeddingService.embedDocument).not.toHaveBeenCalled();
    const match = vectorIndex.search([0.9, 0.1], 1)[0];
    expect(match?.game.slug).toBe('mexico-86');
    expect(match?.game.embedding).toEqual([0.9, 0.1]);
  });

  it('re-embeds games when stored embeddingModel differs from service model', async () => {
    const entry = mockEntries[0]!;
    const docText = computeCatalogDocText(entry);
    const docHash = hashCatalogDocText(docText);

    const storeOlderModel = {
      listCatalogEnrichments: vi.fn().mockResolvedValue([
        {
          slug: 'mexico-86',
          contentHash: 'hash1',
          tagline: entry.tagline,
          shortControls: { en: 'Arrows', pl: 'Strzałki' },
          searchKeywords: entry.searchKeywords,
          embedding: [0.9, 0.1],
          embeddingDocTextHash: docHash,
          embeddingModel: 'older-embedding-model',
          updatedAt: new Date().toISOString(),
        },
      ]),
      getCatalogEnrichment: vi.fn().mockResolvedValue(null),
      setCatalogEnrichment: vi.fn().mockResolvedValue(undefined),
    } as unknown as Store;

    mockEmbeddingService.embedDocument = vi.fn().mockResolvedValue([0.3, 0.7]);

    const indexer = new CatalogIndexer({
      store: storeOlderModel,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => [entry],
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    await indexer.buildIndex();

    expect(mockEmbeddingService.embedDocument).toHaveBeenCalledTimes(1);
    const match = vectorIndex.search([0.3, 0.7], 1)[0];
    expect(match?.game.embedding).toEqual([0.3, 0.7]);
  });

  it('computes missing embeddings and persists them to store', async () => {
    const entry = mockEntries[0]!;
    const setSpy = vi.fn().mockResolvedValue(undefined);
    const storeMissingEmbedding = {
      listCatalogEnrichments: vi.fn().mockResolvedValue([
        {
          slug: 'mexico-86',
          contentHash: 'hash1',
          tagline: entry.tagline,
          shortControls: { en: 'Arrows', pl: 'Strzałki' },
          searchKeywords: entry.searchKeywords,
          updatedAt: new Date().toISOString(),
        },
      ]),
      getCatalogEnrichment: vi.fn().mockResolvedValue(null),
      setCatalogEnrichment: setSpy,
    } as unknown as Store;

    mockEmbeddingService.embedDocument = vi.fn().mockResolvedValue([0.4, 0.6]);

    const indexer = new CatalogIndexer({
      store: storeMissingEmbedding,
      githubClient: mockGithubClient,
      publishedRef: 'main',
      getCatalogEntries: async () => [entry],
      embeddingService: mockEmbeddingService,
      vectorIndex,
    });

    await indexer.buildIndex();

    expect(vectorIndex.size()).toBe(1);
    expect(mockEmbeddingService.embedDocument).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'mexico-86',
        embedding: [0.4, 0.6],
        embeddingDocTextHash: expect.any(String),
        embeddingModel: 'gemini-embedding-2',
      }),
    );
  });
});

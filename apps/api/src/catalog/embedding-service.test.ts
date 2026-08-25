import { describe, it, expect, vi, beforeEach } from 'vitest';
import { l2Norm, normalizeVector, cosineSimilarity, VertexEmbeddingService } from './embedding-service.js';

describe('embedding-service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('computes L2 norm and normalizes vector to unit length', () => {
    const vec = [3, 4];
    expect(l2Norm(vec)).toBe(5);
    const normalized = normalizeVector(vec);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
    expect(l2Norm(normalized)).toBeCloseTo(1);
  });

  it('computes cosine similarity accurately', () => {
    const a = [1, 0];
    const b = [1, 0];
    const c = [0, 1];
    const d = [-1, 0];

    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    expect(cosineSimilarity(a, c)).toBeCloseTo(0);
    expect(cosineSimilarity(a, d)).toBeCloseTo(-1);
  });

  it('generates query embedding with task prompt prefix for gemini models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: {
          values: [0.6, 0.8],
        },
      }),
    } as Response);

    const service = new VertexEmbeddingService({ model: 'gemini-embedding-2' });
    vi.spyOn(
      (service as unknown as { auth: { getClient: () => Promise<unknown> } }).auth,
      'getClient',
    ).mockResolvedValue({
      getAccessToken: async () => ({ token: 'mock-token' }),
    });

    const vec1 = await service.embedQuery('arcade football');
    expect(vec1).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/publishers/google/models/gemini-embedding-2:embedContent'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: { parts: [{ text: 'task: search query | query: arcade football' }] },
        }),
      }),
    );

    // Second call should hit the in-memory cache
    const vec2 = await service.embedQuery('arcade football');
    expect(vec2).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('generates document embedding with title/result prefix for gemini models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: {
          values: [0.6, 0.8],
        },
      }),
    } as Response);

    const service = new VertexEmbeddingService({ model: 'gemini-embedding-2' });
    vi.spyOn(
      (service as unknown as { auth: { getClient: () => Promise<unknown> } }).auth,
      'getClient',
    ).mockResolvedValue({
      getAccessToken: async () => ({ token: 'mock-token' }),
    });

    const vec = await service.embedDocument('Tournament soccer game.', "Mexico '86");
    expect(vec).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/publishers/google/models/gemini-embedding-2:embedContent'),
      expect.objectContaining({
        body: JSON.stringify({
          content: { parts: [{ text: "title: Mexico '86 | task: search result | text: Tournament soccer game." }] },
        }),
      }),
    );
  });

  it('generates embedding with :predict for legacy text-* models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [
          {
            embeddings: {
              values: [0.6, 0.8],
            },
          },
        ],
      }),
    } as Response);

    const service = new VertexEmbeddingService({ model: 'text-multilingual-embedding-002' });
    vi.spyOn(
      (service as unknown as { auth: { getClient: () => Promise<unknown> } }).auth,
      'getClient',
    ).mockResolvedValue({
      getAccessToken: async () => ({ token: 'mock-token' }),
    });

    const vec = await service.embedQuery('arcade football');
    expect(vec).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/publishers/google/models/text-multilingual-embedding-002:predict'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ content: 'arcade football', task_type: 'RETRIEVAL_QUERY' }],
        }),
      }),
    );
  });

  it('returns empty array cleanly when Vertex AI is offline or fails', async () => {
    const logs: string[] = [];
    const service = new VertexEmbeddingService({
      log: (msg) => logs.push(msg),
    });
    vi.spyOn(
      (service as unknown as { auth: { getClient: () => Promise<unknown> } }).auth,
      'getClient',
    ).mockRejectedValue(new Error('Auth resolution failed'));

    const vec = await service.embedText('arcade football');
    expect(vec).toEqual([]);
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('Vertex embedding generation failed');
  });
});

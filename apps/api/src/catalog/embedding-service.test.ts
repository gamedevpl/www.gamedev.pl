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

  it('generates embedding and caches repeated queries with mocked Vertex API', async () => {
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

    const service = new VertexEmbeddingService();
    // Stub auth client getAccessToken
    vi.spyOn(
      (service as unknown as { auth: { getClient: () => Promise<unknown> } }).auth,
      'getClient',
    ).mockResolvedValue({
      getAccessToken: async () => ({ token: 'mock-token' }),
    });

    const vec1 = await service.embedText('arcade football');
    expect(vec1).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call should hit the in-memory cache
    const vec2 = await service.embedText('arcade football');
    expect(vec2).toEqual([0.6, 0.8]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty array cleanly when Vertex AI is offline or fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const service = new VertexEmbeddingService();
    const vec = await service.embedText('arcade football');
    expect(vec).toEqual([]);
  });
});

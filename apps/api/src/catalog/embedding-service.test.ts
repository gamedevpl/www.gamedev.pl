import { describe, it, expect } from 'vitest';
import { l2Norm, normalizeVector, cosineSimilarity, VertexEmbeddingService } from './embedding-service.js';

describe('embedding-service', () => {
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

  it('generates deterministic fallback embeddings when offline', async () => {
    const service = new VertexEmbeddingService();
    const vec1 = await service.embedText('arcade football');
    const vec2 = await service.embedText('arcade football');
    const vec3 = await service.embedText('space shooter');

    expect(vec1.length).toBeGreaterThan(0);
    expect(vec1).toEqual(vec2);
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1);
    // Distinct texts should have similarity < 1
    expect(cosineSimilarity(vec1, vec3)).toBeLessThan(1);
  });
});

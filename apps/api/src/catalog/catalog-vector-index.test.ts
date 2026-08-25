import { describe, it, expect } from 'vitest';
import { CatalogVectorIndex, type IndexedGameVector } from './catalog-vector-index.js';

describe('catalog-vector-index', () => {
  const footballGame: IndexedGameVector = {
    slug: 'mexico-86',
    title: "Mexico '86",
    genre: 'Sports',
    embedding: [1, 0, 0],
    tagline: { en: 'Arcade soccer', pl: 'Piłka nożna' },
  };

  const spaceGame: IndexedGameVector = {
    slug: 'asteroids',
    title: 'Asteroids',
    genre: 'Arcade',
    embedding: [0, 1, 0],
    tagline: { en: 'Space action', pl: 'Kosmiczna akcja' },
  };

  it('manages index lifecycle: upsert, size, remove, clear', () => {
    const index = new CatalogVectorIndex();
    expect(index.size()).toBe(0);

    index.upsert(footballGame);
    index.upsert(spaceGame);
    expect(index.size()).toBe(2);

    expect(index.remove('mexico-86')).toBe(true);
    expect(index.size()).toBe(1);

    index.clear();
    expect(index.size()).toBe(0);
  });

  it('searches and ranks games by cosine similarity', () => {
    const index = new CatalogVectorIndex();
    index.upsert(footballGame);
    index.upsert(spaceGame);

    // Query close to football [0.9, 0.1, 0]
    const results = index.search([0.9, 0.1, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].game.slug).toBe('mexico-86');
    expect(results[0].score).toBeGreaterThan(0.9);
    expect(results[1].game.slug).toBe('asteroids');
  });

  it('finds best match above threshold or returns null', () => {
    const index = new CatalogVectorIndex();
    index.upsert(footballGame);

    const highMatch = index.findBestMatch([1, 0, 0], 0.7);
    expect(highMatch).not.toBeNull();
    expect(highMatch?.game.slug).toBe('mexico-86');

    // Orthogonal vector has score 0, below threshold 0.7
    const lowMatch = index.findBestMatch([0, 1, 0], 0.7);
    expect(lowMatch).toBeNull();
  });

  it('atomically replaces all entries via replaceAll', () => {
    const index = new CatalogVectorIndex();
    index.upsert(footballGame);
    expect(index.size()).toBe(1);

    index.replaceAll([spaceGame]);
    expect(index.size()).toBe(1);
    expect(index.findBestMatch([0, 1, 0], 0.7)?.game.slug).toBe('asteroids');
    expect(index.findBestMatch([1, 0, 0], 0.7)).toBeNull();
  });
});

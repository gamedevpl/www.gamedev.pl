import { describe, it, expect } from 'vitest';
import { indexItems } from './world-index-utils';

describe('world-index-utils', () => {
  const items = [
    { id: 1, position: { x: 10, y: 10 }, type: 'A', stats: { health: 100, level: 1 } },
    { id: 2, position: { x: 20, y: 20 }, type: 'B', stats: { health: 50, level: 2 } },
    { id: 3, position: { x: 30, y: 30 }, type: 'A', stats: { health: 100, level: 2 } },
    { id: 4, position: { x: 15, y: 15 }, type: 'C', stats: { health: 75, level: 1 }, width: 10, height: 10 },
  ];
  const mapDimensions = { width: 100, height: 100 };

  it('should return all items', () => {
    const index = indexItems(items, mapDimensions);
    expect(index.all()).toEqual(items);
  });

  it('should return correct count', () => {
    const index = indexItems(items, mapDimensions);
    expect(index.count()).toBe(4);
  });

  it('should find items by rect', () => {
    const index = indexItems(items, mapDimensions);
    const result = index.byRect({ left: 5, top: 5, right: 15, bottom: 15 });
    // Item 1 is at (10, 10)
    // Item 4 is at (15, 15) with width 10, height 10 (rect: 15, 15 to 25, 25)
    // Flatbush search is inclusive.
    expect(result.map((i) => i.id)).toContain(1);
    expect(result.map((i) => i.id)).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should find items by radius', () => {
    const index = indexItems(items, mapDimensions);
    const result = index.byRadius({ x: 12, y: 12 }, 5);
    // Item 1 is at (10, 10), distance is sqrt(2^2 + 2^2) = 2.82 < 5
    // Item 4 is at (15, 15), distance is sqrt(3^2 + 3^2) = 4.24 < 5
    expect(result.map((i) => i.id)).toContain(1);
    expect(result.map((i) => i.id)).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should find items by property', () => {
    const index = indexItems(items, mapDimensions);
    const result = index.byProperty('type', 'A');
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it('should find items by property path', () => {
    const index = indexItems(items, mapDimensions);

    const health100 = index.byPropertyPath('stats.health', 100);
    expect(health100.map((i) => i.id)).toEqual([1, 3]);

    const level2 = index.byPropertyPath('stats.level', 2);
    expect(level2.map((i) => i.id)).toEqual([2, 3]);

    const missing = index.byPropertyPath('stats.nonexistent', 1);
    expect(missing).toEqual([]);
  });

  it('should handle deeply nested property paths', () => {
    const complexItems = [
      { id: 1, position: { x: 0, y: 0 }, data: { nested: { value: 42 } } },
      { id: 2, position: { x: 0, y: 0 }, data: { nested: { value: 10 } } },
    ];
    const index = indexItems(complexItems, mapDimensions);
    const result = index.byPropertyPath('data.nested.value', 42);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it('should cache property and property path results', () => {
    const index = indexItems(items, mapDimensions);

    // First call populates cache
    index.byProperty('type', 'A');
    index.byPropertyPath('stats.health', 100);

    // Verify it still works
    expect(index.byProperty('type', 'A').map((i) => i.id)).toEqual([1, 3]);
    expect(index.byPropertyPath('stats.health', 100).map((i) => i.id)).toEqual([1, 3]);
  });

  it('should reset caches', () => {
    const index = indexItems(items, mapDimensions);

    index.byProperty('type', 'A');
    index.byPropertyPath('stats.health', 100);

    index.resetPropertyCache();

    // After reset, it should still work (re-populating the cache)
    expect(index.byProperty('type', 'A').map((i) => i.id)).toEqual([1, 3]);
    expect(index.byPropertyPath('stats.health', 100).map((i) => i.id)).toEqual([1, 3]);
  });

  it('should return empty array for empty items list', () => {
    const index = indexItems([], mapDimensions);
    expect(index.all()).toEqual([]);
    expect(index.count()).toBe(0);
    expect(index.byPropertyPath('any.path', 1)).toEqual([]);
  });

  describe('world wrapping', () => {
    const mapDimensions = { width: 100, height: 100 };
    const wrappedItems = [
      { id: 1, position: { x: 5, y: 5 } }, // Top-left
      { id: 2, position: { x: 95, y: 95 } }, // Bottom-right
      { id: 3, position: { x: 50, y: 50 } }, // Center
    ];

    it('should find items by radius across horizontal boundary', () => {
      const index = indexItems(wrappedItems, mapDimensions);
      // Search from x=98, radius 10 should find item at x=5 (distance 7)
      const result = index.byRadius({ x: 98, y: 5 }, 10);
      expect(result.map((i) => i.id)).toContain(1);
      expect(result.length).toBe(1);
    });

    it('should find items by radius across vertical boundary', () => {
      const index = indexItems(wrappedItems, mapDimensions);
      // Search from y=98, radius 10 should find item at y=5 (distance 7)
      const result = index.byRadius({ x: 5, y: 98 }, 10);
      expect(result.map((i) => i.id)).toContain(1);
      expect(result.length).toBe(1);
    });

    it('should find items by radius across both boundaries (diagonal)', () => {
      const index = indexItems(wrappedItems, mapDimensions);
      // Search from (98, 98), radius 15 should find item at (5, 5) (distance sqrt(7^2 + 7^2) = 9.9)
      const result = index.byRadius({ x: 98, y: 98 }, 15);
      expect(result.map((i) => i.id)).toContain(2); // Same side
      expect(result.map((i) => i.id)).toContain(1); // Wrapped side
      expect(result.length).toBe(2);
    });

    it('should find items by rect across horizontal boundary', () => {
      const index = indexItems(wrappedItems, mapDimensions);
      // Rect from x=90 to x=110 (wrapped: 90-100 and 0-10)
      const result = index.byRect({ left: 90, top: 0, right: 110, bottom: 10 });
      expect(result.map((i) => i.id)).toContain(1);
      expect(result.length).toBe(1);
    });

    it('should find items by rect across vertical boundary', () => {
      const index = indexItems(wrappedItems, mapDimensions);
      // Rect from y=90 to y=110 (wrapped: 90-100 and 0-10)
      const result = index.byRect({ left: 0, top: 90, right: 10, bottom: 110 });
      expect(result.map((i) => i.id)).toContain(1);
      expect(result.length).toBe(1);
    });
  });
});

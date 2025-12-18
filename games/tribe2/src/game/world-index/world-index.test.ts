import { describe, it, expect } from 'vitest';
import { indexItems } from './world-index-utils';

describe('world-index-utils', () => {
  const items = [
    { id: 1, position: { x: 10, y: 10 }, type: 'A', stats: { health: 100, level: 1 } },
    { id: 2, position: { x: 20, y: 20 }, type: 'B', stats: { health: 50, level: 2 } },
    { id: 3, position: { x: 30, y: 30 }, type: 'A', stats: { health: 100, level: 2 } },
    { id: 4, position: { x: 15, y: 15 }, type: 'C', stats: { health: 75, level: 1 }, width: 10, height: 10 },
  ];

  it('should return all items', () => {
    const index = indexItems(items);
    expect(index.all()).toEqual(items);
  });

  it('should return correct count', () => {
    const index = indexItems(items);
    expect(index.count()).toBe(4);
  });

  it('should find items by rect', () => {
    const index = indexItems(items);
    const result = index.byRect({ left: 5, top: 5, right: 15, bottom: 15 });
    // Item 1 is at (10, 10)
    // Item 4 is at (15, 15) with width 10, height 10 (rect: 15, 15 to 25, 25)
    // Flatbush search is inclusive.
    expect(result.map(i => i.id)).toContain(1);
    expect(result.map(i => i.id)).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should find items by radius', () => {
    const index = indexItems(items);
    const result = index.byRadius({ x: 12, y: 12 }, 5);
    // Item 1 is at (10, 10), distance is sqrt(2^2 + 2^2) = 2.82 < 5
    // Item 4 is at (15, 15), distance is sqrt(3^2 + 3^2) = 4.24 < 5
    expect(result.map(i => i.id)).toContain(1);
    expect(result.map(i => i.id)).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should find items by property', () => {
    const index = indexItems(items);
    const result = index.byProperty('type', 'A');
    expect(result.map(i => i.id)).toEqual([1, 3]);
  });

  it('should find items by property path', () => {
    const index = indexItems(items);
    
    const health100 = index.byPropertyPath('stats.health', 100);
    expect(health100.map(i => i.id)).toEqual([1, 3]);

    const level2 = index.byPropertyPath('stats.level', 2);
    expect(level2.map(i => i.id)).toEqual([2, 3]);

    const missing = index.byPropertyPath('stats.nonexistent', 1);
    expect(missing).toEqual([]);
  });

  it('should handle deeply nested property paths', () => {
    const complexItems = [
      { id: 1, position: { x: 0, y: 0 }, data: { nested: { value: 42 } } },
      { id: 2, position: { x: 0, y: 0 }, data: { nested: { value: 10 } } },
    ];
    const index = indexItems(complexItems);
    const result = index.byPropertyPath('data.nested.value', 42);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it('should cache property and property path results', () => {
    const index = indexItems(items);
    
    // First call populates cache
    index.byProperty('type', 'A');
    index.byPropertyPath('stats.health', 100);

    // Verify it still works
    expect(index.byProperty('type', 'A').map(i => i.id)).toEqual([1, 3]);
    expect(index.byPropertyPath('stats.health', 100).map(i => i.id)).toEqual([1, 3]);
  });

  it('should reset caches', () => {
    const index = indexItems(items);
    
    index.byProperty('type', 'A');
    index.byPropertyPath('stats.health', 100);
    
    index.resetPropertyCache();
    
    // After reset, it should still work (re-populating the cache)
    expect(index.byProperty('type', 'A').map(i => i.id)).toEqual([1, 3]);
    expect(index.byPropertyPath('stats.health', 100).map(i => i.id)).toEqual([1, 3]);
  });

  it('should return empty array for empty items list', () => {
    const index = indexItems([]);
    expect(index.all()).toEqual([]);
    expect(index.count()).toBe(0);
    expect(index.byPropertyPath('any.path', 1)).toEqual([]);
  });
});

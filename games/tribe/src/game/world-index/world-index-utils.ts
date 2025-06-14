import Flatbush from 'flatbush';
import { Entity } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';
import { IndexType, Rect } from './world-index-types';

const indexCache: Record<string, IndexType<Entity>> = {};

/**
 * Creates an indexed queryable object from a list of items.
 * @param items The array of entities to index.
 * @param cacheKey An optional key to cache the index.
 * @returns An IndexType object for querying the items.
 */
export function indexItems<T extends Entity>(items: T[], cacheKey?: string): IndexType<T> {
  if (cacheKey && indexCache[cacheKey]) {
    return indexCache[cacheKey] as IndexType<T>;
  }

  if (items.length === 0) {
    return {
      byRect: () => [],
      byRadius: () => [],
      byProperty: () => [],
      resetPropertyCache: () => {},
    } as IndexType<T>;
  }

  const index = new Flatbush(items.length);
  const propertyCache = new Map<keyof T, Map<unknown, T[]>>();

  for (const item of items) {
    index.add(item.position.x, item.position.y, item.position.x, item.position.y);
  }
  index.finish();

  const result: IndexType<T> = {
    byRect(rect: Rect): T[] {
      const indices = index.search(rect.left, rect.top, rect.right, rect.bottom);
      return indices.map((i) => items[i]);
    },

    byRadius(position: Vector2D, distance: number): T[] {
      const indices = index.neighbors(position.x, position.y, undefined, distance);
      return indices.map((i) => items[i]);
    },

    byProperty(propertyName: keyof T, propertyValue: unknown): T[] {
      if (!propertyCache.has(propertyName)) {
        const newCache = new Map<unknown, T[]>();
        for (const item of items) {
          const value = item[propertyName];
          if (!newCache.has(value)) {
            newCache.set(value, []);
          }
          newCache.get(value)!.push(item);
        }
        propertyCache.set(propertyName, newCache);
      }
      return propertyCache.get(propertyName)?.get(propertyValue) || [];
    },

    resetPropertyCache() {
      propertyCache.clear();
    },
  };

  if (cacheKey) {
    indexCache[cacheKey] = result;
  }

  return result;
}

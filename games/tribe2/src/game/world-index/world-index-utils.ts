import Flatbush from 'flatbush';
import { Vector2D } from '../utils/math-types';
import { IndexType, Rect } from './world-index-types';

interface IndexItem {
  position: Vector2D;
  width?: number;
  height?: number;
}

/**
 * Resolves a nested property value from an object using a dot-separated path.
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
}

const indexCache: Record<string, IndexType<IndexItem>> = {};

/**
 * Creates an indexed queryable object from a list of items.
 * @param items The array of entities to index.
 * @param cacheKey An optional key to cache the index.
 * @returns An IndexType object for querying the items.
 */
export function indexItems<T extends IndexItem>(items: T[], cacheKey?: string): IndexType<T> {
  if (cacheKey && indexCache[cacheKey]) {
    return indexCache[cacheKey] as IndexType<T>;
  }

  if (items.length === 0) {
    return {
      all: () => [],
      byRect: () => [],
      byRadius: () => [],
      byProperty: () => [],
      byPropertyPath: () => [],
      resetPropertyCache: () => {},
      count: () => 0,
    } as IndexType<T>;
  }

  const index = new Flatbush(items.length);
  const propertyCache = new Map<keyof T, Map<unknown, T[]>>();
  const propertyByPathCache = new Map<string, Map<unknown, T[]>>();

  for (const item of items) {
    if (item.width !== undefined && item.height !== undefined) {
      index.add(item.position.x, item.position.y, item.position.x + item.width, item.position.y + item.height);
    } else {
      index.add(item.position.x, item.position.y, item.position.x, item.position.y);
    }
  }
  index.finish();

  const result: IndexType<T> = {
    all(): T[] {
      return items;
    },
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

    byPropertyPath(propertyPath: string, propertyValue: unknown): T[] {
      if (!propertyByPathCache.has(propertyPath)) {
        const newCache = new Map<unknown, T[]>();
        for (const item of items) {
          const value = getNestedProperty(item, propertyPath);
          if (!newCache.has(value)) {
            newCache.set(value, []);
          }
          newCache.get(value)!.push(item);
        }
        propertyByPathCache.set(propertyPath, newCache);
      }
      return propertyByPathCache.get(propertyPath)?.get(propertyValue) || [];
    },

    resetPropertyCache() {
      propertyCache.clear();
      propertyByPathCache.clear();
    },

    count() {
      return items.length;
    },
  };

  if (cacheKey) {
    indexCache[cacheKey] = result;
  }

  return result;
}

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
function getNestedProperty<T = unknown>(obj: unknown, path: string): T | undefined {
  return path.split('.').reduce((acc, part) => {
    // Check if acc is a non-null object and the key exists
    if (acc && typeof acc === 'object' && part in acc) {
      // Safe assertion to access the property by string key
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj) as T | undefined;
}

/**
 * Creates an indexed queryable object from a list of items.
 * @param items The array of entities to index.
 * @param cacheKey An optional key to cache the index.
 * @param mapDimensions The dimensions of the game map for wrapping support.
 * @returns An IndexType object for querying the items.
 */
export function indexItems<T extends IndexItem>(
  items: T[],
  mapDimensions: { width: number; height: number },
): IndexType<T> {
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
      const { width, height } = mapDimensions;
      const results = new Set<number>();

      const xRanges: { left: number; right: number }[] = [];
      if (rect.left < 0) {
        xRanges.push({ left: rect.left + width, right: width });
        xRanges.push({ left: 0, right: rect.right });
      } else if (rect.right > width) {
        xRanges.push({ left: rect.left, right: width });
        xRanges.push({ left: 0, right: rect.right - width });
      } else {
        xRanges.push({ left: rect.left, right: rect.right });
      }

      const yRanges: { top: number; bottom: number }[] = [];
      if (rect.top < 0) {
        yRanges.push({ top: rect.top + height, bottom: height });
        yRanges.push({ top: 0, bottom: rect.bottom });
      } else if (rect.bottom > height) {
        yRanges.push({ top: rect.top, bottom: height });
        yRanges.push({ top: 0, bottom: rect.bottom - height });
      } else {
        yRanges.push({ top: rect.top, bottom: rect.bottom });
      }

      for (const xRange of xRanges) {
        for (const yRange of yRanges) {
          const indices = index.search(xRange.left, yRange.top, xRange.right, yRange.bottom);
          for (const i of indices) results.add(i);
        }
      }

      return Array.from(results).map((i) => items[i]);
    },

    byRadius(position: Vector2D, distance: number): T[] {
      const { width, height } = mapDimensions;
      const results = new Set<number>();

      // Search original and wrapped positions.
      // We check if the search circle at (x + dx, y + dy) overlaps with the indexed bounds [0, width] x [0, height].
      for (let dx = -width; dx <= width; dx += width) {
        for (let dy = -height; dy <= height; dy += height) {
          const searchX = position.x + dx;
          const searchY = position.y + dy;

          const closestX = Math.max(0, Math.min(searchX, width));
          const closestY = Math.max(0, Math.min(searchY, height));
          const distSq = (searchX - closestX) ** 2 + (searchY - closestY) ** 2;

          if (distSq <= distance ** 2) {
            const indices = index.neighbors(searchX, searchY, undefined, distance);
            for (const i of indices) results.add(i);
          }
        }
      }

      return Array.from(results).map((i) => items[i]);
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

  return result;
}

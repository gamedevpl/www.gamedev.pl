import Flatbush from 'flatbush';
import { Vector2D } from '../utils/math-types';
import { IndexType, Rect } from './world-index-types';
import { calculateWrappedDistanceSq } from '../utils/math-utils';

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
  let queryCounter = 0;
  const visited = new Uint32Array(items.length);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
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
      const results: T[] = [];
      queryCounter++;

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

      for (let i = 0; i < xRanges.length; i++) {
        const xr = xRanges[i];
        for (let j = 0; j < yRanges.length; j++) {
          const yr = yRanges[j];
          const indices = index.search(xr.left, yr.top, xr.right, yr.bottom);
          for (let k = 0; k < indices.length; k++) {
            const idx = indices[k];
            if (visited[idx] !== queryCounter) {
              visited[idx] = queryCounter;
              results.push(items[idx]);
            }
          }
        }
      }

      return results;
    },

    byRadius(position: Vector2D, distance: number): T[] {
      const { width: worldWidth, height: worldHeight } = mapDimensions;
      const results: T[] = [];
      queryCounter++;

      const distSqThreshold = distance * distance;

      const minX = position.x - distance;
      const maxX = position.x + distance;
      const minY = position.y - distance;
      const maxY = position.y + distance;

      const xRanges: { left: number; right: number }[] = [];
      if (minX < 0) {
        xRanges.push({ left: minX + worldWidth, right: worldWidth });
        xRanges.push({ left: 0, right: maxX });
      } else if (maxX > worldWidth) {
        xRanges.push({ left: minX, right: worldWidth });
        xRanges.push({ left: 0, right: maxX - worldWidth });
      } else {
        xRanges.push({ left: minX, right: maxX });
      }

      const yRanges: { top: number; bottom: number }[] = [];
      if (minY < 0) {
        yRanges.push({ top: minY + worldHeight, bottom: worldHeight });
        yRanges.push({ top: 0, bottom: maxY });
      } else if (maxY > worldHeight) {
        yRanges.push({ top: minY, bottom: worldHeight });
        yRanges.push({ top: 0, bottom: maxY - worldHeight });
      } else {
        yRanges.push({ top: minY, bottom: maxY });
      }

      for (let i = 0; i < xRanges.length; i++) {
        const xr = xRanges[i];
        for (let j = 0; j < yRanges.length; j++) {
          const yr = yRanges[j];
          const indices = index.search(xr.left, yr.top, xr.right, yr.bottom);

          for (let k = 0; k < indices.length; k++) {
            const idx = indices[k];
            if (visited[idx] !== queryCounter) {
              visited[idx] = queryCounter;
              const item = items[idx];

              const dSq = calculateWrappedDistanceSq(
                position,
                item.position,
                worldWidth,
                worldHeight
              );

              if (dSq <= distSqThreshold) {
                results.push(item);
              }
            }
          }
        }
      }

      return results;
    },

    byProperty(propertyName: keyof T, propertyValue: unknown): T[] {
      if (!propertyCache.has(propertyName)) {
        const newCache = new Map<unknown, T[]>();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
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
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
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

/**
 * Mock implementation of search indexes for testing behaviors.
 * This provides a simple in-memory implementation of IndexType interface
 * without requiring the complex spatial indexing of the real implementation.
 */

import { Vector2D } from '../../../../utils/math-types';
import { IndexType, Rect, IndexedWorldState } from '../../../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { GameWorldState } from '../../../../world-types';

/**
 * Creates a mock index for a specific entity type.
 * This index stores entities in a simple array and implements spatial queries
 * using naive iteration (good enough for testing small datasets).
 */
export function createMockIndex<T extends { position: Vector2D; id: string }>(
  entities: T[],
  mapWidth: number,
  mapHeight: number,
): IndexType<T> {
  const propertyCache = new Map<string, T[]>();

  return {
    all(): T[] {
      return [...entities];
    },

    byRect(rect: Rect): T[] {
      return entities.filter((entity) => {
        const { position } = entity;
        return (
          position.x >= rect.left &&
          position.x <= rect.right &&
          position.y >= rect.top &&
          position.y <= rect.bottom
        );
      });
    },

    byRadius(position: Vector2D, distance: number): T[] {
      return entities.filter((entity) => {
        const dist = calculateWrappedDistance(position, entity.position, mapWidth, mapHeight);
        return dist <= distance;
      });
    },

    byProperty(propertyName: keyof T, propertyValue: unknown): T[] {
      const cacheKey = `${String(propertyName)}:${JSON.stringify(propertyValue)}`;
      
      if (propertyCache.has(cacheKey)) {
        return propertyCache.get(cacheKey)!;
      }

      const results = entities.filter((entity) => {
        return entity[propertyName] === propertyValue;
      });

      propertyCache.set(cacheKey, results);
      return results;
    },

    resetPropertyCache(): void {
      propertyCache.clear();
    },

    count(): number {
      return entities.length;
    },
  };
}

/**
 * Converts a GameWorldState into an IndexedWorldState for testing.
 * This creates mock indexes for all entity types based on the entities
 * currently in the game state.
 */
export function createIndexedWorldState(gameState: GameWorldState): IndexedWorldState {
  const { entities } = gameState.entities;
  const { width, height } = gameState.mapDimensions;

  // Extract entities by type
  const humans: any[] = [];
  const berryBushes: any[] = [];
  const corpses: any[] = [];
  const prey: any[] = [];
  const predators: any[] = [];
  const buildings: any[] = [];

  for (const entity of Object.values(entities)) {
    switch (entity.type) {
      case 'human':
        humans.push(entity);
        break;
      case 'berryBush':
        berryBushes.push(entity);
        break;
      case 'corpse':
        corpses.push(entity);
        break;
      case 'prey':
        prey.push(entity);
        break;
      case 'predator':
        predators.push(entity);
        break;
      case 'building':
        buildings.push(entity);
        break;
    }
  }

  return {
    ...gameState,
    search: {
      human: createMockIndex(humans, width, height),
      berryBush: createMockIndex(berryBushes, width, height),
      corpse: createMockIndex(corpses, width, height),
      prey: createMockIndex(prey, width, height),
      predator: createMockIndex(predators, width, height),
      building: createMockIndex(buildings, width, height),
    },
  };
}

import { Entity, EntityId, EntityType } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance } from './math-utils';
import { Vector2D } from './math-types';

export function findClosestEntity<T extends Entity>(
  sourceEntityOrPosition: Entity | Vector2D,
  gameState: GameWorldState,
  targetType: EntityType,
  maxDistance: number,
  filterFn?: (entity: T) => boolean,
): T | null {
  const indexedState = gameState as IndexedWorldState;
  const searchRadius = maxDistance;
  const sourceEntity =
    'position' in sourceEntityOrPosition && sourceEntityOrPosition.id ? sourceEntityOrPosition : null;
  const sourcePosition = sourceEntity ? sourceEntity.position : (sourceEntityOrPosition as Vector2D);

  const candidates = indexedState.search[targetType].byRadius(sourcePosition, searchRadius) as unknown as T[];

  let closestEntity: T | null = null;
  let minDistance = searchRadius;

  for (const entity of candidates) {
    if (entity.id === sourceEntity?.id || (filterFn && !filterFn(entity))) {
      continue;
    }

    const distance = calculateWrappedDistance(
      sourcePosition,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestEntity = entity;
    }
  }

  return closestEntity;
}

function findEntitiesOfTypeInRadius<T extends Entity>(
  sourcePosition: Vector2D,
  gameState: GameWorldState,
  targetType: EntityType,
  radius: number,
): T[] {
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search[targetType].byRadius(sourcePosition, radius) as unknown as T[];
}

export function countEntitiesOfTypeInRadius(
  sourcePosition: Vector2D,
  gameState: GameWorldState,
  targetType: EntityType,
  radius: number,
): number {
  return findEntitiesOfTypeInRadius(sourcePosition, gameState, targetType, radius).length;
}

export function findPlayerEntity(gameState: GameWorldState): HumanEntity | undefined {
  const indexedState = gameState as IndexedWorldState;
  const players = indexedState.search.human.byProperty('isPlayer', true);
  return players.length > 0 ? players[0] : undefined;
}

export function findClosestAggressor(targetId: EntityId, gameState: GameWorldState): HumanEntity | null {
  const indexedState = gameState as IndexedWorldState;
  const potentialAggressors = indexedState.search.human.byProperty('activeAction', 'attacking');
  let closestAggressor: HumanEntity | null = null;
  let minDistance = Infinity;
  for (const human of potentialAggressors) {
    if (human.attackTargetId !== targetId) {
      continue; // Only consider aggressors targeting the specified entity
    }
    const distance = calculateWrappedDistance(
      human.position,
      gameState.entities.entities[targetId]?.position || { x: 0, y: 0 },
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance < minDistance) {
      closestAggressor = human as HumanEntity;
      minDistance = distance;
    }
  }
  return closestAggressor;
}

export function findAllHumans(gameState: GameWorldState): HumanEntity[] {
  return Object.values(gameState.entities.entities).filter((entity) => entity.type === 'human') as HumanEntity[];
}

export function findEntityAtPosition(
  position: Vector2D,
  gameState: GameWorldState,
  entityType?: EntityType,
): Entity | undefined {
  const { width, height } = gameState.mapDimensions;
  // Iterate in reverse to find the top-most entity first (assuming entities are sorted by y-pos for rendering)
  const entities = Object.values(gameState.entities.entities).reverse();

  for (const entity of entities) {
    if (entityType && entity.type !== entityType) {
      continue;
    }

    const distance = calculateWrappedDistance(position, entity.position, width, height);
    const hoverRadius = entity.type === 'tree' ? entity.radius * 2 : entity.radius;
    if (distance < hoverRadius) {
      return entity;
    }
  }
  return undefined;
}

/**
 * Checks if a specific location is too close to the center of any other tribe.
 * Used for strategic building placement to avoid crowding or settling too close to enemies.
 */
export function isLocationTooCloseToOtherTribes(
  location: Vector2D,
  myLeaderId: EntityId | undefined,
  minDistance: number,
  gameState: GameWorldState,
): boolean {
  const humans = findAllHumans(gameState);
  const otherTribeCenters: Record<string, { sumX: number; sumY: number; count: number }> = {};

  // Group humans by tribe to calculate approximate centers
  for (const human of humans) {
    if (!human.leaderId || human.leaderId === myLeaderId) continue;

    if (!otherTribeCenters[human.leaderId]) {
      otherTribeCenters[human.leaderId] = { sumX: 0, sumY: 0, count: 0 };
    }
    // Note: Using simple average for center calculation.
    // This is an approximation that might be slightly off for tribes spanning the world seam,
    // but sufficient for general proximity checks.
    otherTribeCenters[human.leaderId].sumX += human.position.x;
    otherTribeCenters[human.leaderId].sumY += human.position.y;
    otherTribeCenters[human.leaderId].count++;
  }

  for (const tribeId in otherTribeCenters) {
    const data = otherTribeCenters[tribeId];
    const center: Vector2D = {
      x: data.sumX / data.count,
      y: data.sumY / data.count,
    };

    const dist = calculateWrappedDistance(
      location,
      center,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (dist < minDistance) {
      return true;
    }
  }

  return false;
}

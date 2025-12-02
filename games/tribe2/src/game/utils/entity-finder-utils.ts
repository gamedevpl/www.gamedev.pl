import { Entity, EntityId, EntityType } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance, vectorDistance } from './math-utils';
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

export function findEntitiesOfTypeInRadius<T extends Entity>(
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
      gameState.entities.entities.get(targetId)?.position || { x: 0, y: 0 },
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
  return Array.from(gameState.entities.entities.values()).filter((entity) => entity.type === 'human') as HumanEntity[];
}

export function getClosestEntityFromList<T extends Entity>(
  position: Vector2D,
  entities: T[],
  gameState: GameWorldState,
) {
  if (entities.length === 0) {
    return undefined;
  }

  let closestEntity = entities[0];
  let closestDistance = calculateWrappedDistance(
    position,
    closestEntity.position,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  for (const entity of entities.slice(1)) {
    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestEntity = entity;
    }
  }

  return closestEntity;
}

export function findEntityAtPosition(
  position: Vector2D,
  gameState: GameWorldState,
  entityType?: EntityType,
): Entity | undefined {
  // Iterate in reverse to find the top-most entity first (assuming entities are sorted by y-pos for rendering)
  const entities = Array.from(gameState.entities.entities.values()).reverse();

  for (const entity of entities) {
    if (entityType && entity.type !== entityType) {
      continue;
    }

    const distance = vectorDistance(position, entity.position);
    if (distance < entity.radius) {
      return entity;
    }
  }
  return undefined;
}

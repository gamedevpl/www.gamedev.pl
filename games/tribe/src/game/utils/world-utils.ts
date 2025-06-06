import { EntityId, Entity, EntityType } from '../entities/entities-types';
import { Vector2D } from './math-types';
import { calculateWrappedDistance, vectorAdd } from './math-utils';
import { HumanEntity } from '../entities/characters/human/human-types'; // Added import
import { HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../world-consts'; // Added import

/**
 * Generates a random position within a radius of a center point, accounting for world wrapping
 * @param center The center position
 * @param radius The maximum distance from the center
 * @param worldWidth The width of the world
 * @param worldHeight The height of the world
 * @returns A new random position
 */
export function getRandomNearbyPosition(
  center: Vector2D,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  // Generate a random angle in radians (0 to 2π)
  const randomAngle = Math.random() * Math.PI * 2;

  // Generate a random distance (0 to radius)
  // Using square root to ensure uniform distribution in the circle
  const randomDistance = Math.sqrt(Math.random()) * radius;

  // Calculate the offset from the center
  const offset = {
    x: Math.cos(randomAngle) * randomDistance,
    y: Math.sin(randomAngle) * randomDistance,
  };

  // Add the offset to the center
  const newPosition = vectorAdd(center, offset);

  // Wrap the position to ensure it's within world boundaries
  return {
    x: ((newPosition.x % worldWidth) + worldWidth) % worldWidth,
    y: ((newPosition.y % worldHeight) + worldHeight) % worldHeight,
  };
}

/**
 * Checks if a position is occupied by any entity within a specified radius
 * @param position The position to check
 * @param entities Map of all entities
 * @param checkRadius The radius to check for occupation
 * @param worldWidth The width of the world
 * @param worldHeight The height of the world
 * @returns True if the position is occupied, false otherwise
 */
export function isPositionOccupied(
  position: Vector2D,
  entities: Map<EntityId, Entity>,
  checkRadius: number,
  worldWidth: number,
  worldHeight: number,
): boolean {
  for (const entity of entities.values()) {
    // Skip checking against the position itself if it's an entity (this check might be too simplistic if position is not unique)
    // if (entity.position === position) continue; // This direct comparison might not be robust
    const distance = calculateWrappedDistance(position, entity.position, worldWidth, worldHeight);

    if (distance < checkRadius) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the closest entity of a specific type to a source entity.
 * @param sourceEntity The entity from which to measure distance.
 * @param allEntities A map of all entities in the game.
 * @param targetType The type of entity to search for.
 * @param worldWidth The width of the game world for wrapped distance calculation.
 * @param worldHeight The height of the game world for wrapped distance calculation.
 * @param maxDistance Optional maximum distance to consider. Entities beyond this distance will be ignored.
 * @returns The closest entity of the specified type, or null if none are found within range.
 */
export function findClosestEntity<T extends Entity>(
  sourceEntity: Entity,
  allEntities: Map<EntityId, Entity>,
  targetType: EntityType,
  worldWidth: number,
  worldHeight: number,
  maxDistance?: number,
  filterFn?: (entity: Entity) => boolean,
): T | null {
  let closestEntity: T | null = null;
  let minDistance = maxDistance !== undefined ? maxDistance : Infinity;

  for (const entity of allEntities.values()) {
    if (entity.id === sourceEntity.id || entity.type !== targetType || (filterFn && !filterFn(entity))) {
      // Skip the source entity itself, entities of different type, or those that don't pass the filter
      continue;
    }

    const distance = calculateWrappedDistance(sourceEntity.position, entity.position, worldWidth, worldHeight);

    if (distance < minDistance) {
      minDistance = distance;
      closestEntity = entity as T;
    }
  }

  return closestEntity;
}

/**
 * Counts the number of entities of a specific type within a radius of a source position.
 * @param sourcePosition The position from which to measure distance.
 * @param allEntities A map of all entities in the game.
 * @param targetType The type of entity to count.
 * @param radius The maximum distance to consider entities within.
 * @param worldWidth The width of the game world for wrapped distance calculation.
 * @param worldHeight The height of the game world for wrapped distance calculation.
 * @returns The number of entities of the specified type within the radius.
 */
export function countEntitiesOfTypeInRadius(
  sourcePosition: Vector2D,
  allEntities: Map<EntityId, Entity>,
  targetType: EntityType,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): number {
  let count = 0;
  for (const entity of allEntities.values()) {
    if (entity.type === targetType && 
        calculateWrappedDistance(sourcePosition, entity.position, worldWidth, worldHeight) <= radius) {
      count++;
    }
  }
  return count;
}

/**
 * Counts the number of living offspring for a given human entity.
 * @param humanId The ID of the human entity whose offspring are to be counted.
 * @param allEntities A map of all entities in the game.
 * @returns The number of living offspring.
 */
export function countLivingOffspring(humanId: EntityId, allEntities: Map<EntityId, Entity>): number {
  let offspringCount = 0;
  for (const entity of allEntities.values()) {
    if (entity.type === 'human') {
      const humanEntity = entity as HumanEntity;
      if (humanEntity.motherId === humanId || humanEntity.fatherId === humanId) {
        // Could add a check here to ensure the offspring is 'alive' if a specific flag for that exists
        // For now, presence in allEntities implies living.
        offspringCount++;
      }
    }
  }
  return offspringCount;
}

/**
 * Finds potential new partners for a given human entity, excluding direct relatives.
 * @param sourceHuman The human entity looking for new partners.
 * @param allEntities A map of all entities in the game.
 * @param radius The search radius for potential partners.
 * @param worldWidth The width of the game world for wrapped distance calculation.
 * @param worldHeight The height of the game world for wrapped distance calculation.
 * @returns An array of HumanEntity objects representing potential new partners.
 */
export function findPotentialNewPartners(
  sourceHuman: HumanEntity,
  allEntities: Map<EntityId, Entity>,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): HumanEntity[] {
  const potentialPartners: HumanEntity[] = [];

  for (const entity of allEntities.values()) {
    if (entity.type !== 'human') {
      continue;
    }
    const partner = entity as HumanEntity;

    // Basic procreation checks for the potential partner
    if (
      partner.id !== sourceHuman.id &&
      partner.gender !== sourceHuman.gender &&
      partner.isAdult &&
      partner.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (partner.procreationCooldown || 0) <= 0 &&
      (partner.gender === 'female' ? !partner.isPregnant : true)
    ) {
      // Check for direct familial relationship (parent or child)
      const isParentOfSource = partner.id === sourceHuman.motherId || partner.id === sourceHuman.fatherId;
      const isChildOfSource = sourceHuman.id === partner.motherId || sourceHuman.id === partner.fatherId;

      if (isParentOfSource || isChildOfSource) {
        continue; // Skip direct relatives
      }

      // Check distance
      const distance = calculateWrappedDistance(
        sourceHuman.position,
        partner.position,
        worldWidth,
        worldHeight,
      );

      if (distance <= radius) {
        potentialPartners.push(partner);
      }
    }
  }
  return potentialPartners;
}

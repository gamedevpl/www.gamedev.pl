import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance } from './math-utils';
import { Vector2D } from './math-types';

const STORAGE_SEARCH_RADIUS = 100;
const STORAGE_ITEM_SCATTER_RADIUS = 25;

/**
 * A simple pseudo-random number generator based on an input seed.
 * Returns a number between 0 and 1.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Checks if there are any nearby non-full storage spots belonging to the human's tribe.
 * Used to determine if gathering should be encouraged to fill storage.
 * @param human The human entity to check for
 * @param gameState The current game state
 * @param searchRadius Optional custom search radius (defaults to 100)
 * @returns True if there's at least one non-full tribe storage nearby
 */
export function hasNearbyNonFullStorage(
  human: HumanEntity,
  gameState: GameWorldState,
  searchRadius: number = STORAGE_SEARCH_RADIUS,
): boolean {
  const indexedState = gameState as IndexedWorldState;
  const nearbyBuildings = indexedState.search.building.byRadius(human.position, searchRadius);

  return nearbyBuildings.some((building) => {
    const buildingEntity = building as BuildingEntity;
    return (
      buildingEntity.buildingType === 'storageSpot' &&
      buildingEntity.ownerId === human.leaderId &&
      buildingEntity.isConstructed &&
      buildingEntity.storedFood &&
      buildingEntity.storageCapacity &&
      buildingEntity.storedFood.length < buildingEntity.storageCapacity
    );
  });
}

/**
 * Finds nearby tribe storage spots that have food available.
 * @param human The human entity searching for storage
 * @param gameState The current game state
 * @param searchRadius Optional custom search radius (defaults to 100)
 * @returns Array of storage buildings with food
 */
export function findNearbyTribeStorageWithFood(
  human: HumanEntity,
  gameState: GameWorldState,
  searchRadius: number = STORAGE_SEARCH_RADIUS,
): BuildingEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const nearbyBuildings = indexedState.search.building.byRadius(human.position, searchRadius);

  return nearbyBuildings.filter((building) => {
    const buildingEntity = building as BuildingEntity;
    return (
      buildingEntity.buildingType === 'storageSpot' &&
      buildingEntity.ownerId === human.leaderId &&
      buildingEntity.isConstructed &&
      buildingEntity.storedFood &&
      buildingEntity.storedFood.length > 0
    );
  }) as BuildingEntity[];
}

/**
 * Finds nearby tribe storage spots that have available capacity.
 * @param human The human entity searching for storage
 * @param gameState The current game state
 * @param searchRadius Optional custom search radius (defaults to 100)
 * @returns Array of storage buildings with capacity
 */
export function findNearbyTribeStorageWithCapacity(
  human: HumanEntity,
  gameState: GameWorldState,
  searchRadius: number = STORAGE_SEARCH_RADIUS,
): BuildingEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const nearbyBuildings = indexedState.search.building.byRadius(human.position, searchRadius);

  return nearbyBuildings.filter((building) => {
    const buildingEntity = building as BuildingEntity;
    return (
      buildingEntity.buildingType === 'storageSpot' &&
      buildingEntity.ownerId === human.leaderId &&
      buildingEntity.isConstructed &&
      buildingEntity.storedFood &&
      buildingEntity.storageCapacity &&
      buildingEntity.storedFood.length < buildingEntity.storageCapacity
    );
  }) as BuildingEntity[];
}

/**
 * Finds the closest storage from a list of storage buildings.
 * @param human The human entity
 * @param storages Array of storage buildings
 * @param gameState The current game state
 * @returns The closest storage and its distance, or null if no storage available
 */
export function findClosestStorage(
  human: HumanEntity,
  storages: BuildingEntity[],
  gameState: GameWorldState,
): { storage: BuildingEntity; distance: number } | null {
  if (storages.length === 0) {
    return null;
  }

  let closestStorage: BuildingEntity | null = null;
  let closestDistance = Infinity;

  for (const storage of storages) {
    const distance = calculateWrappedDistance(
      human.position,
      storage.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestStorage = storage;
    }
  }

  return closestStorage ? { storage: closestStorage, distance: closestDistance } : null;
}

/** Calculates the position offset for a food item within a storage building */
export function calculateStorageFoodPosition(storage: BuildingEntity): Vector2D {
  const itemCount = storage.storedFood ? storage.storedFood.length : 0;
  const angle = pseudoRandom(itemCount + storage.id) * 2 * Math.PI;
  const radius = pseudoRandom(itemCount + storage.id + 1) * STORAGE_ITEM_SCATTER_RADIUS;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

import { HumanEntity } from '../characters/human/human-types';
import { BuildingEntity, BuildingType } from '../buildings/building-types';
import { EntityId } from '../entities-types';
import { GameWorldState } from '../../world-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { getTribeMembers } from './family-tribe-utils';
import { calculateWrappedDistance } from '../../utils/math-utils';
import { isPositionOccupied, isPositionInZone } from '../../utils/spatial-utils';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../plants/berry-bush/berry-bush-consts';
import { Vector2D } from '../../utils/math-types';
import { isSoilDepleted, getDepletedSectorsInArea } from '../plants/soil-depletion-update';
import { ItemType } from '../item-types';
import { FoodType } from '../food-types';
import { BUILDING_DEFINITIONS } from '../buildings/building-consts';

const STORAGE_SEARCH_RADIUS = 500; // Max distance for storage spot assignment

/**
 * Calculates the tribe's overall food security score.
 * Returns a value between 0 and 1, where:
 * - 0 means no food at all
 * - 1 means all storage and members are at full capacity
 *
 * @param human A member of the tribe
 * @param gameState The current game state
 * @returns Food security score (0-1), or 0 if the human has no tribe
 */
export function calculateTribeFoodSecurity(human: HumanEntity, gameState: GameWorldState): number {
  if (!human.leaderId) {
    return 0;
  }

  const totalFood = getTribeTotalFood(human.leaderId, gameState);
  const totalCapacity = getTribeTotalCapacity(human.leaderId, gameState);

  if (totalCapacity === 0) {
    return 0;
  }

  return Math.min(1, totalFood / totalCapacity);
}

/**
 * Calculates the total amount of food available to the tribe.
 * This includes food in storage spots and food carried by tribe members.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Total food count
 */
function getTribeTotalFood(leaderId: EntityId, gameState: GameWorldState): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);
  const storageSpots = getTribeStorageSpots(leaderId, gameState);

  // Sum food from tribe members
  const memberFood = tribeMembers.reduce((sum, member) => sum + member.food.length, 0);

  // Sum food from storage spots
  const storageFood = storageSpots.reduce((sum, storage) => {
    const foodItems = storage.storedItems?.filter(
      (si) => si.item.type === FoodType.Berry || si.item.type === FoodType.Meat,
    );
    return sum + (foodItems?.length || 0);
  }, 0);

  return memberFood + storageFood;
}

/**
 * Calculates the total food capacity available to the tribe.
 * This includes storage capacity and the carrying capacity of all tribe members.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Total capacity
 */
function getTribeTotalCapacity(leaderId: EntityId, gameState: GameWorldState): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);
  const storageSpots = getTribeStorageSpots(leaderId, gameState);

  // Sum max food capacity from tribe members
  const memberCapacity = tribeMembers.reduce((sum, member) => sum + member.maxFood, 0);

  // Sum capacity from storage spots
  const storageCapacity = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storageCapacity || 0);
  }, 0);

  return memberCapacity + storageCapacity;
}

/**
 * Calculates how full the tribe's storage spots are.
 * Returns a value between 0 and 1, where:
 * - 0 means storage is empty
 * - 1 means storage is full
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Storage utilization (0-1), or 0 if no storage exists
 */
export function getStorageUtilization(leaderId: EntityId, gameState: GameWorldState): number {
  const storageSpots = getTribeStorageSpots(leaderId, gameState);

  if (storageSpots.length === 0) {
    return 0;
  }

  const totalStorageItems = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storedItems?.length || 0);
  }, 0);

  const totalStorageCapacity = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storageCapacity || 0);
  }, 0);

  if (totalStorageCapacity === 0) {
    return 0;
  }

  return Math.min(1, totalStorageItems / totalStorageCapacity);
}

/**
 * Calculates the amount of wood the tribe currently needs.
 * This includes wood required for active construction projects plus a maintenance buffer.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Total wood units needed
 */
export function getTribeWoodNeed(leaderId: EntityId, gameState: GameWorldState): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);
  const buffer = 0;

  // Calculate wood needed for current construction projects
  const indexedState = gameState as IndexedWorldState;
  const tribeBuildings = indexedState.search.building.all().filter((b) => {
    if (!b.ownerId) return false;
    const owner = gameState.entities.entities[b.ownerId] as HumanEntity | undefined;
    return owner && owner.leaderId === leaderId;
  });

  const constructionWoodNeeded = tribeBuildings.reduce((sum, b) => {
    if (b.isConstructed) return sum;
    const woodCost = BUILDING_DEFINITIONS[b.buildingType].cost.wood || 0;
    return sum + woodCost;
  }, 0);

  // Calculate current wood in stock
  const storageSpots = getTribeStorageSpots(leaderId, gameState);
  const storedWood = storageSpots.reduce((sum, storage) => {
    const woodItems = storage.storedItems?.filter((si) => si.item.type === ItemType.Wood);
    return sum + (woodItems?.length || 0);
  }, 0);

  const heldWood = tribeMembers.reduce((sum, member) => {
    return sum + (member.heldItem?.type === ItemType.Wood ? 1 : 0);
  }, 0);

  const totalInStock = storedWood + heldWood;
  const totalNeeded = constructionWoodNeeded + buffer;

  return Math.max(0, totalNeeded - totalInStock);
}

/**
 * Calculates the number of productive bushes per tribe member.
 * Productive bushes are those that are not dying and have food available.
 * Only counts bushes within a reasonable radius of the tribe center.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Bushes per member ratio
 */
export function getProductiveBushes(leaderId: EntityId, gameState: GameWorldState): { count: number; ratio: number } {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);

  if (tribeMembers.length === 0) {
    return { count: 0, ratio: 0 };
  }

  const productiveBushCount = getProductiveBushCount(leaderId, gameState);
  return {
    count: productiveBushCount,
    ratio: productiveBushCount / tribeMembers.length,
  };
}

/**
 * Counts the number of productive bushes near the tribe.
 * Productive bushes are those that are not dying and have food available.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Count of productive bushes
 */
function getProductiveBushCount(leaderId: EntityId, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;

  // Find all bushes near the tribe center
  const nearbyBushes = indexedState.search.berryBush.all().filter((bush) => {
    return indexedState.search.terrainOwnership
      .byRadius(bush.position, bush.radius)
      .some((territory) => territory.ownerId === leaderId);
  });

  // Count bushes that are productive (not dying and have food)
  const productiveBushes = nearbyBushes.filter((bush) => {
    // Check state machine for dying state
    const isDying = bush.stateMachine && bush.stateMachine[0] === 'bushDying';

    // Check if bush has food (food is an array of FoodItem)
    const hasFood = bush.food.length > 0;
    const isOnDepletedSoil = isSoilDepleted(
      gameState.soilDepletion,
      bush.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return !isDying && hasFood && !isOnDepletedSoil;
  });

  return productiveBushes.length;
}

/**
 * Gets all constructed planting zones owned by tribe members.
 *
 * @param human A member of the tribe
 * @param gameState The current game state
 * @returns Array of planting zone buildings
 */
export function getTribePlantingZones(human: HumanEntity, gameState: GameWorldState): BuildingEntity[] {
  if (!human.leaderId) {
    return [];
  }

  const indexedState = gameState as IndexedWorldState;
  const tribeBuildings = indexedState.search.building.byProperty('ownerId', human.leaderId);

  return tribeBuildings.filter((building) => {
    return building.buildingType === BuildingType.PlantingZone && building.isConstructed;
  }) as BuildingEntity[];
}

/**
 * Checks if a planting zone is still productive based on soil health.
 * A zone is considered viable if less than 50% of its area is depleted.
 *
 * @param zone The planting zone building
 * @param gameState The current game state
 * @returns True if the zone is viable, false otherwise
 */
export function isPlantingZoneViable(zone: BuildingEntity, gameState: GameWorldState): boolean {
  const { width, height, position } = zone;
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Get depleted sectors and total sector count
  const { depletedSectors, totalSectorsCount } = getDepletedSectorsInArea(
    gameState.soilDepletion,
    position,
    width,
    height,
    worldWidth,
    worldHeight,
  );

  if (totalSectorsCount === 0) {
    return true;
  }

  // Consider viable if less than 50% depleted
  return depletedSectors.length / totalSectorsCount < 0.25;
}

/**
 * Calculates the maximum number of bushes that can fit in a planting zone.
 * Based on zone dimensions and bush clearance radius.
 *
 * @param zone The planting zone building
 * @returns Maximum number of bushes
 */
function calculatePlantingZoneCapacity(zone: BuildingEntity): number {
  const diameter = BERRY_BUSH_PLANTING_CLEARANCE_RADIUS * 2;
  const bushesPerRow = Math.floor(zone.width / diameter);
  const bushesPerColumn = Math.floor(zone.height / diameter);
  return bushesPerRow * bushesPerColumn;
}

/**
 * Counts the number of berry bushes currently within a planting zone.
 *
 * @param zone The planting zone building
 * @param gameState The current game state
 * @returns Count of bushes in the zone
 */
function countBushesInZone(zone: BuildingEntity, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;

  // Get all bushes near the zone center
  const searchRadius = Math.max(zone.width, zone.height);
  const nearbyBushes = indexedState.search.berryBush.byRadius(zone.position, searchRadius);

  // Filter bushes that are actually within the zone's rectangular bounds
  const bushesInZone = nearbyBushes.filter((bush) => {
    const dx = Math.abs(bush.position.x - zone.position.x);
    const dy = Math.abs(bush.position.y - zone.position.y);
    return dx <= zone.width / 2 && dy <= zone.height / 2;
  });

  return bushesInZone.length;
}

/**
 * Gets detailed distribution information for all tribe storage spots.
 * For each storage, calculates capacity, current items, assigned depositors, and distance.
 *
 * @param human A member of the tribe
 * @param gameState The current game state
 * @returns Array of storage distribution data
 */
function getStorageSpotDistribution(
  human: HumanEntity,
  gameState: GameWorldState,
): Array<{
  storage: BuildingEntity;
  capacity: number;
  currentItems: number;
  assignedDepositors: number;
  distance: number;
}> {
  if (!human.leaderId) {
    return [];
  }

  const storageSpots = getTribeStorageSpots(human.leaderId, gameState);
  const tribeMembers = getTribeMembers(human, gameState);

  return storageSpots.map((storage) => {
    const capacity = storage.storageCapacity || 0;
    const currentItems = storage.storedItems?.length || 0;

    // Count tribe members currently depositing to this storage
    const assignedDepositors = tribeMembers.filter((member) => {
      if (member.activeAction !== 'depositing') {
        return false;
      }

      // Check if the member is targeting this storage
      if (typeof member.target === 'object' && 'x' in member.target) {
        const targetPos = member.target;
        const distance = calculateWrappedDistance(
          targetPos,
          storage.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        // Consider them assigned if within interaction range
        return distance <= 50; // Reasonable interaction range
      }

      return false;
    }).length;

    const distance = calculateWrappedDistance(
      human.position,
      storage.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    return {
      storage,
      capacity,
      currentItems,
      assignedDepositors,
      distance,
    };
  });
}

/**
 * Assigns a human to the most suitable storage spot for depositing.
 * Prioritizes storage with the lowest fill ratio, fewest depositors, and closest distance.
 * Only considers storage within a reasonable radius.
 *
 * @param human The human to assign a storage spot to
 * @param gameState The current game state
 * @returns The assigned storage spot, or null if no suitable storage exists
 */
export function assignStorageSpot(human: HumanEntity, gameState: GameWorldState): BuildingEntity | null {
  const distribution = getStorageSpotDistribution(human, gameState);

  if (distribution.length === 0) {
    return null;
  }

  // Filter out full storage and those too far away
  const availableStorage = distribution.filter((d) => {
    const hasCapacity = d.currentItems < d.capacity;
    const isNearby = d.distance <= STORAGE_SEARCH_RADIUS;
    return hasCapacity && isNearby;
  });

  if (availableStorage.length === 0) {
    return null;
  }

  // Sort by fill ratio (ascending), then by assigned depositors (ascending), then by distance (ascending)
  availableStorage.sort((a, b) => {
    const fillRatioA = a.currentItems / a.capacity;
    const fillRatioB = b.currentItems / b.capacity;

    // Prioritize emptier storage
    if (Math.abs(fillRatioA - fillRatioB) > 0.1) {
      return fillRatioA - fillRatioB;
    }

    // Then prioritize storage with fewer depositors
    if (a.assignedDepositors !== b.assignedDepositors) {
      return a.assignedDepositors - b.assignedDepositors;
    }

    // Finally, prioritize closer storage
    return a.distance - b.distance;
  });

  return availableStorage[0].storage;
}

/**
 * Counts how many tribe members are currently performing a specific action.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @param action The action to count ('planting' or 'depositing')
 * @returns Count of tribe members performing the action
 */
export function countTribeMembersWithAction(
  leaderId: EntityId,
  gameState: GameWorldState,
  action: 'planting' | 'depositing',
): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);

  return tribeMembers.filter((member) => member.activeAction === action).length;
}

/**
 * Gets all constructed storage spots owned by tribe members.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Array of storage spot buildings
 */
export function getTribeStorageSpots(leaderId: EntityId, gameState: GameWorldState): BuildingEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const allBuildings = indexedState.search.building.all();

  return allBuildings.filter((building) => {
    // Must be a storage spot
    if (building.buildingType !== BuildingType.StorageSpot) {
      return false;
    }

    // Must be constructed
    if (!building.isConstructed) {
      return false;
    }

    // Must be owned by a tribe member
    if (building.ownerId) {
      const owner = gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
      return owner && owner.leaderId === leaderId;
    }

    return false;
  }) as BuildingEntity[];
}

/**
 * Finds an optimal planting spot within the tribe's planting zones.
 * Returns null if no zones exist or all zones are full.
 * Now considers soil depletion when selecting planting spots.
 */
export function findOptimalPlantingZoneSpot(
  human: HumanEntity,
  gameState: GameWorldState,
): { position: Vector2D; zoneId: EntityId } | null {
  const zones = getTribePlantingZones(human, gameState);

  // No planting zones exist
  if (zones.length === 0) {
    return null;
  }

  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;
  const soilDepletion = gameState.soilDepletion;

  // Try each zone to find a valid planting spot
  for (const zone of zones) {
    const capacity = calculatePlantingZoneCapacity(zone);
    const currentCount = countBushesInZone(zone, gameState);

    // Skip if this zone is full
    if (currentCount >= capacity) {
      continue;
    }

    // Try to find a valid spot within this zone (multiple random attempts)
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate a random position within the zone
      const randomX = zone.position.x + (Math.random() - 0.5) * zone.width;
      const randomY = zone.position.y + (Math.random() - 0.5) * zone.height;

      const position = {
        x: ((randomX % worldWidth) + worldWidth) % worldWidth,
        y: ((randomY % worldHeight) + worldHeight) % worldHeight,
      };

      // Check if soil is depleted at this position
      if (isSoilDepleted(soilDepletion, position, worldWidth, worldHeight)) {
        continue; // Skip depleted soil
      }

      // Check if this position is valid (not occupied)
      if (!isPositionOccupied(position, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS)) {
        return { position, zoneId: zone.id };
      }
    }
  }

  // All zones are full or no valid spots found
  return null;
}

/**
 * Checks if a position is inside any of the player's tribe's planting zones.
 * @param position The position to check
 * @param player The player entity
 * @param gameState The current game state
 * @returns true if the position is in any planting zone, false otherwise
 */
export function isPositionInAnyPlantingZone(
  position: Vector2D,
  gameState: GameWorldState,
  player: HumanEntity | undefined = undefined,
): boolean {
  if (player) {
    const zones = getTribePlantingZones(player, gameState);
    return zones.some((zone) => isPositionInZone(position, zone, gameState));
  }

  const indexedState = gameState as IndexedWorldState;
  // Using spatial search to find nearby planting zones instead of checking all planting zones in the world.
  // The search radius 60 covers the maximum dimension of a planting zone.
  const nearbyBuildings = indexedState.search.building.byRadius(position, 60);
  return nearbyBuildings.some(
    (building) => building.buildingType === BuildingType.PlantingZone && isPositionInZone(position, building, gameState),
  );
}

/**
 * Checks if a position is inside any planting zone and has sufficient clearance from existing bushes.
 */
export function isValidPlantingSpotInZone(
  position: Vector2D,
  gameState: GameWorldState,
  player: HumanEntity | undefined = undefined,
): boolean {
  if (!isPositionInAnyPlantingZone(position, gameState, player)) {
    return false;
  }

  return !isPositionOccupied(position, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS);
}

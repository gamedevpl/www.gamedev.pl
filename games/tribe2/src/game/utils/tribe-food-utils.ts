import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../entities/buildings/building-types';
import { EntityId } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { getTribeMembers } from './family-tribe-utils';
import { calculateWrappedDistance } from './math-utils';
import { getTribeCenter, isPositionOccupied, isPositionInZone } from './spatial-utils';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../berry-bush-consts';
import { Vector2D } from './math-types';

const TRIBE_BUSH_SEARCH_RADIUS = 500; // Radius to search for bushes near tribe center
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
export function getTribeTotalFood(leaderId: EntityId, gameState: GameWorldState): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);
  const storageSpots = getTribeStorageSpots(leaderId, gameState);

  // Sum food from tribe members
  const memberFood = tribeMembers.reduce((sum, member) => sum + member.food.length, 0);

  // Sum food from storage spots
  const storageFood = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storedFood?.length || 0);
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
export function getTribeTotalCapacity(leaderId: EntityId, gameState: GameWorldState): number {
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

  const totalStorageFood = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storedFood?.length || 0);
  }, 0);

  const totalStorageCapacity = storageSpots.reduce((sum, storage) => {
    return sum + (storage.storageCapacity || 0);
  }, 0);

  if (totalStorageCapacity === 0) {
    return 0;
  }

  return Math.min(1, totalStorageFood / totalStorageCapacity);
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
export function getProductiveBushDensity(leaderId: EntityId, gameState: GameWorldState): number {
  const tribeMembers = getTribeMembers({ leaderId } as HumanEntity, gameState);

  if (tribeMembers.length === 0) {
    return 0;
  }

  const productiveBushCount = getProductiveBushCount(leaderId, gameState);
  return productiveBushCount / tribeMembers.length;
}

/**
 * Counts the number of productive bushes near the tribe.
 * Productive bushes are those that are not dying and have food available.
 *
 * @param leaderId The ID of the tribe leader
 * @param gameState The current game state
 * @returns Count of productive bushes
 */
export function getProductiveBushCount(leaderId: EntityId, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;
  const tribeCenter = getTribeCenter(leaderId, gameState);

  // Find all bushes near the tribe center
  const nearbyBushes = indexedState.search.berryBush.byRadius(tribeCenter, TRIBE_BUSH_SEARCH_RADIUS);

  // Count bushes that are productive (not dying and have food)
  const productiveBushes = nearbyBushes.filter((bush) => {
    // Check state machine for dying state
    const isDying = bush.stateMachine && bush.stateMachine[0] === 'bushDying';

    // Check if bush has food (food is an array of FoodItem)
    const hasFood = bush.food.length > 0;
    return !isDying && hasFood;
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
  const allBuildings = indexedState.search.building.all();

  return allBuildings.filter((building) => {
    // Must be a planting zone
    if (building.buildingType !== BuildingType.PlantingZone) {
      return false;
    }

    // Must be constructed
    if (!building.isConstructed) {
      return false;
    }

    // Must be owned by a tribe member
    if (building.ownerId) {
      const owner = gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
      return owner && owner.leaderId === human.leaderId;
    }

    return false;
  }) as BuildingEntity[];
}

/**
 * Calculates the maximum number of bushes that can fit in a planting zone.
 * Based on zone dimensions and bush clearance radius.
 *
 * @param zone The planting zone building
 * @returns Maximum number of bushes
 */
export function calculatePlantingZoneCapacity(zone: BuildingEntity): number {
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
export function countBushesInZone(zone: BuildingEntity, gameState: GameWorldState): number {
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
 * Gets detailed distribution information for all tribe planting zones.
 * For each zone, calculates capacity, current bush count, and number of assigned planters.
 *
 * @param human A member of the tribe
 * @param gameState The current game state
 * @returns Array of zone distribution data
 */
export function getPlantingZoneDistribution(
  human: HumanEntity,
  gameState: GameWorldState,
): Array<{
  zone: BuildingEntity;
  capacity: number;
  currentBushes: number;
  assignedPlanters: number;
}> {
  const zones = getTribePlantingZones(human, gameState);
  const tribeMembers = getTribeMembers(human, gameState);

  return zones.map((zone: BuildingEntity) => {
    const capacity = calculatePlantingZoneCapacity(zone);
    const currentBushes = countBushesInZone(zone, gameState);

    // Count tribe members currently planting who are targeting this zone
    const assignedPlanters = tribeMembers.filter((member) => {
      if (member.activeAction !== 'planting') {
        return false;
      }

      // Check if the member's target is within this zone
      if (typeof member.target === 'object' && 'x' in member.target) {
        const targetPos = member.target;
        // Use a simple distance check to see if target is near zone center
        const distance = calculateWrappedDistance(
          targetPos,
          zone.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        // Consider them assigned if within zone's diagonal distance
        const zoneDiagonal = Math.sqrt(zone.width * zone.width + zone.height * zone.height) / 2;
        return distance <= zoneDiagonal;
      }

      return false;
    }).length;

    return {
      zone,
      capacity,
      currentBushes,
      assignedPlanters,
    };
  });
}

/**
 * Gets detailed distribution information for all tribe storage spots.
 * For each storage, calculates capacity, current food, assigned depositors, and distance.
 *
 * @param human A member of the tribe
 * @param gameState The current game state
 * @returns Array of storage distribution data
 */
export function getStorageSpotDistribution(
  human: HumanEntity,
  gameState: GameWorldState,
): Array<{
  storage: BuildingEntity;
  capacity: number;
  currentFood: number;
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
    const currentFood = storage.storedFood?.length || 0;

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
      currentFood,
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
    const hasCapacity = d.currentFood < d.capacity;
    const isNearby = d.distance <= STORAGE_SEARCH_RADIUS;
    return hasCapacity && isNearby;
  });

  if (availableStorage.length === 0) {
    return null;
  }

  // Sort by fill ratio (ascending), then by assigned depositors (ascending), then by distance (ascending)
  availableStorage.sort((a, b) => {
    const fillRatioA = a.currentFood / a.capacity;
    const fillRatioB = b.currentFood / b.capacity;

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
 * Also validates that the position has sufficient clearance from existing bushes.
 * @param position The position to check
 * @param player The player entity
 * @param gameState The current game state
 * @returns true if the position is in any planting zone and has clearance, false otherwise
 */
export function isPositionInAnyPlantingZone(
  position: Vector2D,
  player: HumanEntity,
  gameState: GameWorldState,
): boolean {
  const zones = getTribePlantingZones(player, gameState);
  const isInZone = zones.some((zone) => isPositionInZone(position, zone, gameState));

  // If not in any zone, return false immediately
  if (!isInZone) {
    return false;
  }

  // Check if the position has sufficient clearance from existing bushes
  return !isPositionOccupied(position, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS);
}

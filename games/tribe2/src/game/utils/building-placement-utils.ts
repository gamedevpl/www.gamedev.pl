import { Vector2D } from './math-types';
import { GameWorldState } from '../world-types';
import { BuildingType, getBuildingDimensions } from '../building-consts';
import { BuildingEntity } from '../entities/buildings/building-types';
import { EntityId } from '../entities/entities-types';
import { createBuilding as createBuildingEntity } from '../entities/entities-update';
import { isPositionOccupied, getTribeCenter } from './spatial-utils';
import { calculateWrappedDistance } from './math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';
import { updatePlantingZoneConnections } from './planting-zone-connections-utils';
import { canPlaceBuildingInTerritory } from '../entities/tribe/territory-utils';
import { getDepletedSectorsInArea } from '../soil-depletion-update';
import { isLocationTooCloseToOtherTribes } from './entity-finder-utils';

/**
 * Checks if a building of a given type can be placed at the specified position.
 * @param position The position to check (center of the building).
 * @param buildingType The type of building to place.
 * @param gameState The current game state.
 * @returns True if the building can be placed, false otherwise.
 */
export function canPlaceBuilding(
  position: Vector2D,
  buildingType: BuildingType,
  ownerId: EntityId | undefined,
  gameState: GameWorldState,
): boolean {
  if (ownerId === undefined) {
    return false;
  }

  const dimensions = getBuildingDimensions(buildingType);
  // Use the larger dimension as the radius for the circular check,
  // or a slightly smaller value if we want to be more lenient.
  // Using half the diagonal would be the most conservative circular approximation.
  const radius = Math.sqrt(dimensions.width * dimensions.width + dimensions.height * dimensions.height) / 2;

  // 1. Check if the position is occupied by other entities (humans, bushes, etc.)
  // We use a slightly smaller radius to allow placing buildings somewhat close to things,
  // but not directly on top of them.
  if (isPositionOccupied(position, gameState, radius * 0.8)) {
    return false;
  }

  // 2. For planting zones, check if soil is depleted
  if (buildingType === BuildingType.PlantingZone) {
    const depletedSectors = getDepletedSectorsInArea(
      gameState.soilDepletion,
      position,
      dimensions.width,
      dimensions.height,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (depletedSectors.length > 0) {
      return false; // Cannot place planting zone on depleted soil
    }
  }

  // 3. Check for overlap with existing buildings (using rectangular collision if possible, or radius approximation)
  // For now, we'll use the spatial index and radius check which is already efficient.
  // A more precise rectangular check could be added if needed.
  const indexedState = gameState as IndexedWorldState;
  const nearbyBuildings = indexedState.search.building.byRadius(position, radius * 2);

  for (const building of nearbyBuildings) {
    // Simple circle-circle collision for now.
    // Ideally, this should be AABB (Axis-Aligned Bounding Box) collision considering wrapping.
    const dist = calculateWrappedDistance(
      position,
      building.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Calculate minimum distance needed to avoid overlap
    // This is an approximation. For exact rectangles, it's more complex.
    const minDistance = (Math.max(dimensions.width, dimensions.height) + Math.max(building.width, building.height)) / 2;

    if (dist < minDistance * 0.9) {
      // 0.9 factor to allow slight visual overlap but not logical overlap
      return false;
    }
  }

  // 3. Check territory constraints - buildings can only be placed within or near tribe territory
  const territoryCheck = canPlaceBuildingInTerritory(position, ownerId, gameState);
  if (!territoryCheck.canPlace) {
    return false;
  }

  return true;
}

/**
 * Finds a valid building placement location adjacent to existing tribe buildings.
 * Searches in expanding rings around existing buildings to find suitable locations.
 * If no buildings exist, searches around the tribe center instead.
 *
 * @param buildingType The type of building to place
 * @param ownerId The ID of the tribe leader (owner of the building)
 * @param gameState The current game state
 * @param searchRadius Maximum radius to search from each anchor point
 * @param minDistanceFromOtherTribes Minimum distance to keep from other tribe centers
 * @returns A valid position for building placement, or undefined if none found
 */
export function findAdjacentBuildingPlacement(
  buildingType: BuildingType,
  ownerId: EntityId,
  gameState: GameWorldState,
  searchRadius: number,
  minDistanceFromOtherTribes: number,
): Vector2D | undefined {
  const indexedState = gameState as IndexedWorldState;
  const dimensions = getBuildingDimensions(buildingType);
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Get all buildings owned by this tribe
  const tribeBuildings = indexedState.search.building.byProperty('ownerId', ownerId) as BuildingEntity[];

  // Determine anchor points: existing buildings or tribe center
  const anchorPoints: Vector2D[] = [];

  if (tribeBuildings.length > 0) {
    // Use existing buildings as anchor points
    // Sort by distance from tribe center to prioritize central buildings
    const tribeCenter = getTribeCenter(ownerId, gameState);
    const sortedBuildings = [...tribeBuildings].sort((a, b) => {
      const distA = calculateWrappedDistance(a.position, tribeCenter, worldWidth, worldHeight);
      const distB = calculateWrappedDistance(b.position, tribeCenter, worldWidth, worldHeight);
      return distA - distB;
    });
    anchorPoints.push(...sortedBuildings.map((b) => b.position));
  } else {
    // No buildings yet, use tribe center as anchor
    anchorPoints.push(getTribeCenter(ownerId, gameState));
  }

  // Search parameters
  const buildingSize = Math.max(dimensions.width, dimensions.height);
  const minDistance = buildingSize + 20; // Building size + small gap
  const radiusStep = buildingSize / 2; // Step size for expanding rings

  // Search around each anchor point
  for (const anchor of anchorPoints) {
    // Expand in rings from minDistance to searchRadius
    for (let radius = minDistance; radius <= searchRadius; radius += radiusStep) {
      // Determine number of angles to check based on radius
      // More angles at larger radii for better coverage
      const numAngles = Math.max(8, Math.min(16, Math.ceil((2 * Math.PI * radius) / buildingSize)));
      const angleStep = (2 * Math.PI) / numAngles;

      // Check positions at regular angles around the ring
      for (let i = 0; i < numAngles; i++) {
        const angle = i * angleStep;
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;

        // Calculate candidate position with world wrapping
        const candidateX = anchor.x + offsetX;
        const candidateY = anchor.y + offsetY;

        const wrappedPosition: Vector2D = {
          x: ((candidateX % worldWidth) + worldWidth) % worldWidth,
          y: ((candidateY % worldHeight) + worldHeight) % worldHeight,
        };

        // Validate the candidate position
        if (
          canPlaceBuilding(wrappedPosition, buildingType, ownerId, gameState) &&
          !isLocationTooCloseToOtherTribes(wrappedPosition, ownerId, minDistanceFromOtherTribes, gameState)
        ) {
          return wrappedPosition;
        }
      }
    }
  }

  // No valid location found
  return undefined;
}

/**
 * Creates a new building entity at the specified position.
 * @param position The position to place the building.
 * @param buildingType The type of building to create.
 * @param ownerId The ID of the owner that owns this building.
 * @param gameState The current game state.
 * @returns The created building entity.
 */
export function createBuilding(
  position: Vector2D,
  buildingType: BuildingType,
  ownerId: EntityId,
  gameState: GameWorldState,
): BuildingEntity {
  const building = createBuildingEntity(gameState.entities, position, buildingType, ownerId);
  // Update planting zone connections when a new planting zone is created
  if (buildingType === BuildingType.PlantingZone) {
    updatePlantingZoneConnections(gameState);
  }
  return building;
}

/**
 * Initiates the destruction process for a building.
 * @param buildingId The ID of the building to destroy.
 * @param gameState The current game state.
 */
export function startBuildingDestruction(buildingId: EntityId, gameState: GameWorldState): void {
  const building = gameState.entities.entities[buildingId] as BuildingEntity | undefined;
  if (building && building.type === 'building' && !building.isBeingDestroyed) {
    building.isBeingDestroyed = true;
    building.destructionProgress = 0;
    // Update planting zone connections when a planting zone starts being destroyed
    if (building.buildingType === BuildingType.PlantingZone) {
      updatePlantingZoneConnections(gameState);
    }
  }
}

/**
 * Finds a building at a specific position (e.g., under the mouse cursor).
 * @param position The position to check.
 * @param gameState The current game state.
 * @returns The building at the position, or undefined if none found.
 */
export function findBuildingAtPosition(position: Vector2D, gameState: GameWorldState): BuildingEntity | undefined {
  const indexedState = gameState as IndexedWorldState;

  // Search for buildings in a reasonable radius (e.g., max possible building size)
  const maxBuildingSize = 100;
  const nearbyBuildings = indexedState.search.building.byRadius(position, maxBuildingSize);

  for (const building of nearbyBuildings) {
    // Check if point is inside the building's rectangle
    // We need to account for world wrapping here if buildings can wrap (which they usually don't visually, but logically might)
    // For simplicity, we assume buildings are rendered at their center and don't wrap *across* the edge visually in a way that breaks this simple check
    // relative to their center.

    // Calculate relative position accounting for wrapping
    let dx = position.x - building.position.x;
    let dy = position.y - building.position.y;

    const worldWidth = gameState.mapDimensions.width;
    const worldHeight = gameState.mapDimensions.height;

    // Handle wrapping
    if (Math.abs(dx) > worldWidth / 2) dx -= Math.sign(dx) * worldWidth;
    if (Math.abs(dy) > worldHeight / 2) dy -= Math.sign(dy) * worldHeight;

    if (Math.abs(dx) <= building.width / 2 && Math.abs(dy) <= building.height / 2) {
      return building;
    }
  }

  return undefined;
}

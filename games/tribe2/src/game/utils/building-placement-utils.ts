import { Vector2D } from './math-types';
import { GameWorldState } from '../world-types';
import { BuildingType, getBuildingDimensions } from '../entities/buildings/building-consts';
import { BuildingEntity } from '../entities/buildings/building-types';
import { EntityId } from '../entities/entities-types';
import { createBuilding as createBuildingEntity } from '../entities/entities-update';
import { isPositionOccupied, getTribeCenter } from './spatial-utils';
import { calculateWrappedDistance } from './math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';
import { updatePlantingZoneConnections } from './planting-zone-connections-utils';
import { canPlaceBuildingInTerritory } from '../entities/tribe/territory-utils';
import { getDepletedSectorsInArea } from '../entities/plants/soil-depletion-update';
import { isLocationTooCloseToOtherTribes } from './entity-finder-utils';
import {
  BUILDING_PLACEMENT_MAX_ANCHORS,
  BUILDING_PLACEMENT_SLOW_LOG_THRESHOLD_MS,
  BUILDING_PLACEMENT_TRIG_CACHE_SIZE,
} from '../ai-consts';

/**
 * Statistics for building placement search performance.
 * Used for instrumentation and debugging.
 */
interface PlacementSearchStats {
  totalTimeMs: number;
  anchorsSearched: number;
  candidatesTested: number;
  canPlaceChecks: number;
  tribeDistanceChecks: number;
}

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
  humanPosition?: Vector2D,
  maxDistance?: number,
): boolean {
  if (ownerId === undefined) {
    return false;
  }

  // Check proximity if humanPosition and maxDistance are provided
  if (humanPosition && maxDistance !== undefined) {
    const distance = calculateWrappedDistance(
      humanPosition,
      position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance > maxDistance) {
      return false;
    }
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
 * Pre-computes sine and cosine values for a given number of angles.
 * This avoids repeated Math.sin/cos calls during the search.
 * @param numAngles Number of angles to compute (evenly distributed around circle)
 * @returns Array of {cos, sin} pairs
 */
function precomputeTrigCache(numAngles: number): Array<{ cos: number; sin: number }> {
  const cache: Array<{ cos: number; sin: number }> = [];
  const angleStep = (2 * Math.PI) / numAngles;
  for (let i = 0; i < numAngles; i++) {
    const angle = i * angleStep;
    cache.push({
      cos: Math.cos(angle),
      sin: Math.sin(angle),
    });
  }
  return cache;
}

/**
 * Finds a valid building placement location adjacent to existing tribe buildings.
 * Searches in expanding rings around existing buildings to find suitable locations.
 * If no buildings exist, searches around the tribe center instead.
 *
 * Optimized to reduce frame spikes by:
 * - Capping anchor points to BUILDING_PLACEMENT_MAX_ANCHORS
 * - Pre-computing trigonometric values
 * - Running cheap checks before expensive ones
 * - Avoiding object allocations in tight loops
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
  humanPosition?: Vector2D,
): Vector2D | undefined {
  const startTime = performance.now();
  const stats: PlacementSearchStats = {
    totalTimeMs: 0,
    anchorsSearched: 0,
    candidatesTested: 0,
    canPlaceChecks: 0,
    tribeDistanceChecks: 0,
  };

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
    // If human position is provided, prioritize searching near the human
    if (humanPosition) {
      anchorPoints.unshift(humanPosition);
    }

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

  // OPTIMIZATION: Cap anchor points to MAX_ANCHORS to bound search space
  const maxAnchors = Math.min(anchorPoints.length, BUILDING_PLACEMENT_MAX_ANCHORS);

  // Search parameters
  const buildingSize = Math.max(dimensions.width, dimensions.height);
  const minDistance = buildingSize + 20; // Building size + small gap
  const radiusStep = buildingSize / 2; // Step size for expanding rings

  // Search around each anchor point (capped)
  for (let anchorIdx = 0; anchorIdx < maxAnchors; anchorIdx++) {
    const anchor = anchorPoints[anchorIdx];
    stats.anchorsSearched++;

    // Expand in rings from minDistance to searchRadius
    for (let radius = minDistance; radius <= searchRadius; radius += radiusStep) {
      // Determine number of angles to check based on radius
      // More angles at larger radii for better coverage
      const numAngles = Math.max(
        8,
        Math.min(BUILDING_PLACEMENT_TRIG_CACHE_SIZE, Math.ceil((2 * Math.PI * radius) / buildingSize)),
      );

      // OPTIMIZATION: Pre-compute trig values for this ring
      const trigCache = precomputeTrigCache(numAngles);

      // Check positions at regular angles around the ring
      for (let i = 0; i < numAngles; i++) {
        stats.candidatesTested++;

        // OPTIMIZATION: Use pre-computed trig values
        const offsetX = trigCache[i].cos * radius;
        const offsetY = trigCache[i].sin * radius;

        // Calculate candidate position with world wrapping
        const candidateX = anchor.x + offsetX;
        const candidateY = anchor.y + offsetY;

        // OPTIMIZATION: Use local variables instead of object allocation
        const wx = ((candidateX % worldWidth) + worldWidth) % worldWidth;
        const wy = ((candidateY % worldHeight) + worldHeight) % worldHeight;

        // OPTIMIZATION: Swap check order - run cheap check first
        // Check tribe distance first (1 spatial query + distance checks)
        stats.tribeDistanceChecks++;
        if (isLocationTooCloseToOtherTribes({ x: wx, y: wy }, ownerId, minDistanceFromOtherTribes, gameState)) {
          continue; // Skip this candidate, too close to other tribes
        }

        // Then check if building can be placed (4 spatial queries)
        stats.canPlaceChecks++;
        if (canPlaceBuilding({ x: wx, y: wy }, buildingType, ownerId, gameState)) {
          // Found valid position - log stats and return
          stats.totalTimeMs = performance.now() - startTime;
          if (stats.totalTimeMs > BUILDING_PLACEMENT_SLOW_LOG_THRESHOLD_MS) {
            console.log(
              `[BuildingPlacement] Slow search for ${buildingType}: ${stats.totalTimeMs.toFixed(2)}ms | anchors=${
                stats.anchorsSearched
              }, candidates=${stats.candidatesTested}, canPlace=${stats.canPlaceChecks}, tribeDist=${
                stats.tribeDistanceChecks
              }`,
            );
          }
          // OPTIMIZATION: Only allocate Vector2D on return
          return { x: wx, y: wy };
        }
      }
    }
  }

  // No valid location found - log stats
  stats.totalTimeMs = performance.now() - startTime;
  if (stats.totalTimeMs > BUILDING_PLACEMENT_SLOW_LOG_THRESHOLD_MS) {
    console.log(
      `[BuildingPlacement] Slow search (no valid location) for ${buildingType}: ${stats.totalTimeMs.toFixed(
        2,
      )}ms | anchors=${stats.anchorsSearched}, candidates=${stats.candidatesTested}, canPlace=${
        stats.canPlaceChecks
      }, tribeDist=${stats.tribeDistanceChecks}`,
    );
  }

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

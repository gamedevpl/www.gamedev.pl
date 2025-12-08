import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { GameWorldState } from '../../../world-types';
import { BuildingType } from '../../../building-consts';
import { canPlaceBuilding, createBuilding } from '../../../utils/building-placement-utils';
import { isLocationTooCloseToOtherTribes } from '../../../utils/entity-finder-utils';
import {
  getStorageUtilization,
  getProductiveBushDensity,
  getTribeStorageSpots,
  getTribePlantingZones,
} from '../../../utils/tribe-food-utils';
import { getTribeMembers } from '../../../utils/family-tribe-utils';
import { getTribeCenter } from '../../../utils/spatial-utils';
import { Vector2D } from '../../../utils/math-types';
import { EntityId } from '../../../entities/entities-types';
import { BlackboardData } from '../behavior-tree-blackboard';
import {
  LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
  LEADER_BUILDING_SPIRAL_STEP,
  LEADER_BUILDING_MIN_TRIBE_SIZE,
  LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD,
  LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
  LEADER_BUILDING_MAX_STORAGE_PER_TRIBE,
  LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_MAX_PLANTING_ZONES_PER_TRIBE,
  LEADER_BUILDING_PROJECTED_TRIBE_GROWTH_RATE,
} from '../../../ai-consts';

/**
 * Finds a valid building placement location using a spiral search pattern.
 * Starts from the center position and spirals outward until a valid location is found
 * or the maximum radius is reached.
 *
 * @param centerPos The center position to start the spiral search from (typically tribe center)
 * @param maxRadius The maximum radius to search
 * @param stepSize The distance between spiral check points
 * @param minDistanceFromOtherTribes Minimum distance to keep from other tribe centers
 * @param buildingType The type of building to place
 * @param ownerId The ID of the entity that will own the building
 * @param gameState The current game state
 * @returns A valid position for building placement, or undefined if none found
 */
function findSpiralPlacementLocation(
  centerPos: Vector2D,
  maxRadius: number,
  stepSize: number,
  minDistanceFromOtherTribes: number,
  buildingType: BuildingType,
  ownerId: EntityId,
  gameState: GameWorldState,
): Vector2D | undefined {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Archimedean spiral: r = a + b*theta
  // We'll increment theta and calculate r based on it
  const angleIncrement = Math.PI / 8; // 22.5 degrees per step
  const radiusPerRotation = stepSize * 2; // How much radius increases per full rotation
  const b = radiusPerRotation / (2 * Math.PI);

  let theta = 0;
  let radius = 0;

  // Continue spiraling until we exceed the max radius
  while (radius <= maxRadius) {
    // Calculate position on the spiral
    const x = centerPos.x + radius * Math.cos(theta);
    const y = centerPos.y + radius * Math.sin(theta);

    // Wrap coordinates to world dimensions (toroidal world)
    const wrappedPos: Vector2D = {
      x: ((x % worldWidth) + worldWidth) % worldWidth,
      y: ((y % worldHeight) + worldHeight) % worldHeight,
    };
    if (
      canPlaceBuilding(wrappedPos, buildingType, ownerId, gameState) &&
      !isLocationTooCloseToOtherTribes(wrappedPos, undefined, minDistanceFromOtherTribes, gameState)
    ) {
      return wrappedPos;
    }

    // Move to next point on the spiral
    theta += angleIncrement;
    radius = b * theta;
  }

  // No valid location found within the search radius
  return undefined;
}

/**
 * Behavior tree node for leader building placement.
 * This behavior allows AI-controlled tribe leaders to autonomously place buildings
 * (storage spots and planting zones) based on their tribe's needs.
 *
 * The behavior:
 * 1. Checks if the entity is a tribe leader
 * 2. Evaluates tribe size and building needs
 * 3. Determines which building type to prioritize
 * 4. Searches for a valid placement location using spiral search
 * 5. Creates the building if a valid location is found
 */
class LeaderBuildingPlacementBehavior extends BehaviorNode<HumanEntity> {
  constructor(depth: number) {
    super();
    this.name = 'Leader Building Placement';
    this.depth = depth;
  }

  execute(
    entity: HumanEntity,
    context: { gameState: GameWorldState },
    _blackboard: BlackboardData,
  ): [NodeStatus, string] | NodeStatus {
    // 1. Check if entity is a tribe leader
    if (!entity.leaderId || entity.leaderId !== entity.id) {
      return [NodeStatus.FAILURE, 'Not a tribe leader'];
    }

    // 2. Get tribe members and count adults
    const tribeMembers = getTribeMembers(entity, context.gameState);
    const adultMembers = tribeMembers.filter((member) => member.isAdult);

    // 3. Check minimum tribe size requirement (conservative approach)
    if (adultMembers.length < LEADER_BUILDING_MIN_TRIBE_SIZE) {
      return [NodeStatus.FAILURE, `Tribe too small: ${adultMembers.length}/${LEADER_BUILDING_MIN_TRIBE_SIZE} adults`];
    }

    // 4. Determine building needs
    const existingStorageSpots = getTribeStorageSpots(entity.leaderId, context.gameState);
    const existingPlantingZones = getTribePlantingZones(entity, context.gameState);
    const storageUtilization = getStorageUtilization(entity.leaderId, context.gameState);
    const bushDensity = getProductiveBushDensity(entity.leaderId, context.gameState);

    // Project future tribe size assuming growth
    const projectedAdultCount = Math.ceil(adultMembers.length * (1 + LEADER_BUILDING_PROJECTED_TRIBE_GROWTH_RATE));

    // Bootstrap: If no storage exists yet, build the first one immediately
    const needsFirstStorage = existingStorageSpots.length === 0;

    // Determine if we need storage based on projected tribe size
    // High utilization now OR projected tribe would strain current storage
    const needsStorage =
      existingStorageSpots.length < LEADER_BUILDING_MAX_STORAGE_PER_TRIBE &&
      (needsFirstStorage ||
        storageUtilization > LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD ||
        // Would projected tribe strain storage? (assume same utilization rate)
        storageUtilization * (projectedAdultCount / adultMembers.length) >
          LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD);

    // Determine if we need planting zones based on projected tribe size
    // Low bush density now OR projected tribe would have insufficient bushes
    const projectedBushDensity = bushDensity * (adultMembers.length / projectedAdultCount);
    const needsPlantingZone =
      existingPlantingZones.length < LEADER_BUILDING_MAX_PLANTING_ZONES_PER_TRIBE &&
      (bushDensity < LEADER_BUILDING_MIN_BUSHES_PER_MEMBER ||
        projectedBushDensity < LEADER_BUILDING_MIN_BUSHES_PER_MEMBER);

    // Decide which building to prioritize
    let buildingType: BuildingType | null = null;
    let reason = '';

    if (needsStorage && needsPlantingZone) {
      // Bootstrap first storage takes absolute priority
      if (needsFirstStorage) {
        buildingType = BuildingType.StorageSpot;
        reason = 'Bootstrap: First storage spot for tribe';
      }
      // Both needed - prioritize storage if utilization is very high, otherwise planting zone
      else if (storageUtilization > 0.85) {
        buildingType = BuildingType.StorageSpot;
        reason = `High storage utilization: ${(storageUtilization * 100).toFixed(
          0,
        )}% (projected: ${projectedAdultCount} adults)`;
      } else {
        buildingType = BuildingType.PlantingZone;
        reason = `Low bush density: ${bushDensity.toFixed(1)} bushes/member (projected: ${projectedBushDensity.toFixed(
          1,
        )})`;
      }
    } else if (needsStorage) {
      if (needsFirstStorage) {
        buildingType = BuildingType.StorageSpot;
        reason = 'Bootstrap: First storage spot for tribe';
      } else {
        buildingType = BuildingType.StorageSpot;
        reason = `Storage utilization: ${(storageUtilization * 100).toFixed(
          0,
        )}% (projected: ${projectedAdultCount} adults)`;
      }
    } else if (needsPlantingZone) {
      buildingType = BuildingType.PlantingZone;
      reason = `Bush density: ${bushDensity.toFixed(1)} bushes/member (projected: ${projectedBushDensity.toFixed(
        1,
      )} for ${projectedAdultCount} adults)`;
    }

    // No building needed
    if (!buildingType) {
      return [
        NodeStatus.FAILURE,
        `No building needed. Storage: ${existingStorageSpots.length}/${LEADER_BUILDING_MAX_STORAGE_PER_TRIBE} (${(
          storageUtilization * 100
        ).toFixed(0)}%), Planting: ${
          existingPlantingZones.length
        }/${LEADER_BUILDING_MAX_PLANTING_ZONES_PER_TRIBE} (${bushDensity.toFixed(1)} bushes/member)`,
      ];
    }

    // Determine minimum distance from other tribes
    // First storage spot (base establishment) should be much further from enemies
    const minDistanceFromOtherTribes = needsFirstStorage
      ? LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER
      : LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER;

    // 5. Find a valid placement location using spiral search
    const tribeCenter = getTribeCenter(entity.leaderId, context.gameState);
    const placementLocation = findSpiralPlacementLocation(
      tribeCenter,
      LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
      LEADER_BUILDING_SPIRAL_STEP,
      minDistanceFromOtherTribes,
      buildingType,
      entity.id,
      context.gameState,
    );

    if (!placementLocation) {
      return [
        NodeStatus.FAILURE,
        `No valid location found for ${buildingType} within ${LEADER_BUILDING_SPIRAL_SEARCH_RADIUS}px of tribe center`,
      ];
    }

    // 6. Create the building
    createBuilding(placementLocation, buildingType, entity.id, context.gameState);

    return [
      NodeStatus.SUCCESS,
      `Placed ${buildingType} at (${placementLocation.x.toFixed(0)}, ${placementLocation.y.toFixed(
        0,
      )}). Reason: ${reason}`,
    ];
  }
}

/**
 * Factory function to create a leader building placement behavior node.
 * This should be wrapped in NonPlayerControlled and CachingNode decorators
 * when added to the behavior tree.
 *
 * @param depth The depth of this node in the behavior tree
 * @returns A new LeaderBuildingPlacementBehavior instance
 */
export function createLeaderBuildingPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new LeaderBuildingPlacementBehavior(depth);
}

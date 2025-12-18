import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding, findAdjacentBuildingPlacement } from '../../../utils/building-placement-utils';
import {
  getStorageUtilization,
  getProductiveBushes,
  getTribeStorageSpots,
  getTribePlantingZones,
  isPlantingZoneViable,
} from '../../../entities/tribe/tribe-food-utils';
import { findChildren, getTribeMembers } from '../../../entities/tribe/family-tribe-utils';
import { Blackboard } from '../behavior-tree-blackboard';
import {
  LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
  LEADER_BUILDING_MIN_TRIBE_SIZE,
  LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD,
  LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
  LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_PROJECTED_TRIBE_GROWTH_RATE,
  LEADER_BUILDING_PLACEMENT_PROXIMITY,
  LEADER_BUILDING_MIN_BUSHES,
} from '../../../ai-consts';
import { Sequence, Selector, ConditionNode, ActionNode, CachingNode } from '../nodes';
import { TRIBE_BUILDINGS_MIN_HEADCOUNT } from '../../../entities/tribe/tribe-consts';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { Vector2D } from '../../../utils/math-types';

/**
 * Factory function to create a leader building placement behavior node.
 * This behavior allows AI-controlled tribe leaders to autonomously place buildings
 * (storage spots and planting zones) based on their tribe's needs.
 *
 * The behavior tree structure:
 * - Sequence (all must succeed)
 *   1. Condition: Is tribe leader
 *   2. CachingNode: Analyze tribe (cached for performance)
 *   3. Condition: Tribe meets minimum size
 *   4. Selector (try each until one succeeds)
 *      a. Sequence: Try to place storage (needs → find → move → place)
 *      b. Sequence: Try to place planting zone (needs → find → move → place)
 *
 * @param depth The depth of this node in the behavior tree
 * @returns A new behavior tree for leader building placement
 */
export function createLeaderBuildingPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if entity is a tribe leader
  const isLeaderCondition = new ConditionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId || entity.leaderId !== entity.id) {
        return [false, 'Not a tribe leader'];
      }
      if (findChildren(context.gameState, entity).length < TRIBE_BUILDINGS_MIN_HEADCOUNT) {
        return [false, 'Leader has no children'];
      }
      return [true, 'Is tribe leader'];
    },
    'Is Leader',
    depth + 1,
  );

  // Action: Analyze tribe and cache results in blackboard
  // Store as simple primitives to satisfy BlackboardValueType constraints
  const analyzeTribeAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const tribeMembers = getTribeMembers(entity, context.gameState);
      const adultMembers = tribeMembers.filter((member) => member.isAdult);
      const existingStorageSpots = getTribeStorageSpots(entity.leaderId!, context.gameState);
      const existingPlantingZones = getTribePlantingZones(entity, context.gameState).filter((zone) =>
        isPlantingZoneViable(zone, context.gameState),
      );
      const storageUtilization = getStorageUtilization(entity.leaderId!, context.gameState);
      const { count: bushCount, ratio: bushDensity } = getProductiveBushes(entity.leaderId!, context.gameState);
      const zoneDensity = existingPlantingZones.length / Math.max(1, tribeMembers.length);
      const projectedAdultCount = Math.ceil(adultMembers.length * (1 + LEADER_BUILDING_PROJECTED_TRIBE_GROWTH_RATE));

      // Store individual values as primitives instead of a complex object
      Blackboard.set(blackboard, 'tribeAnalysis_adultCount', adultMembers.length);
      Blackboard.set(blackboard, 'tribeAnalysis_existingStorageSpots', existingStorageSpots.length);
      Blackboard.set(blackboard, 'tribeAnalysis_existingPlantingZones', existingPlantingZones.length);
      Blackboard.set(blackboard, 'tribeAnalysis_storageUtilization', storageUtilization);
      Blackboard.set(blackboard, 'tribeAnalysis_bushCount', bushCount);
      Blackboard.set(blackboard, 'tribeAnalysis_bushDensity', bushDensity);
      Blackboard.set(blackboard, 'tribeAnalysis_zoneDensity', zoneDensity);
      Blackboard.set(blackboard, 'tribeAnalysis_projectedAdultCount', projectedAdultCount);

      return [
        NodeStatus.SUCCESS,
        `Analyzed tribe: ${adultMembers.length} adults, ${existingStorageSpots.length} storage, ${existingPlantingZones.length} viable planting zones`,
      ];
    },
    'Analyze Tribe',
    depth + 1,
  );

  // Wrap tribe analysis in a caching node to avoid recalculating every tick
  const cachedTribeAnalysis = new CachingNode<HumanEntity>(
    analyzeTribeAction,
    1, // Cache for 1 hour
    'Cached Tribe Analysis',
    depth + 1,
  );

  // Condition: Check minimum tribe size
  const hasMinimumTribeSizeCondition = new ConditionNode<HumanEntity>(
    (_entity, _context, blackboard) => {
      const adultCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_adultCount');
      if (adultCount === undefined) {
        return [false, 'No tribe analysis available'];
      }
      if (adultCount < LEADER_BUILDING_MIN_TRIBE_SIZE) {
        return [false, `Tribe too small: ${adultCount}/${LEADER_BUILDING_MIN_TRIBE_SIZE} adults`];
      }
      return [true, `Tribe size sufficient: ${adultCount} adults`];
    },
    'Has Minimum Tribe Size',
    depth + 1,
  );

  // --- Storage Building Branch ---

  // Condition: Needs storage
  const needsStorageCondition = new ConditionNode<HumanEntity>(
    (_entity, _context, blackboard) => {
      const adultCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_adultCount');
      const existingStorageSpots = Blackboard.get<number>(blackboard, 'tribeAnalysis_existingStorageSpots');
      const storageUtilization = Blackboard.get<number>(blackboard, 'tribeAnalysis_storageUtilization');
      const projectedAdultCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_projectedAdultCount');

      if (
        adultCount === undefined ||
        existingStorageSpots === undefined ||
        storageUtilization === undefined ||
        projectedAdultCount === undefined
      ) {
        return [false, 'No tribe analysis available'];
      }

      const needsFirstStorage = existingStorageSpots === 0;
      const projectedUtilization = storageUtilization * (projectedAdultCount / Math.max(1, adultCount));

      const needsStorage =
        needsFirstStorage ||
        storageUtilization > LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD ||
        projectedUtilization > LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD;

      if (!needsStorage) {
        return [false, `Storage adequate: ${existingStorageSpots}, util: ${(storageUtilization * 100).toFixed(0)}%`];
      }

      const reason = needsFirstStorage
        ? 'Bootstrap: First storage spot'
        : `Utilization: ${(storageUtilization * 100).toFixed(0)}% (projected: ${(projectedUtilization * 100).toFixed(
            0,
          )}%)`;

      return [true, reason];
    },
    'Needs Storage',
    depth + 2,
  );

  // Action: Find storage placement location
  const findStorageLocationAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const existingStorageSpots = Blackboard.get<number>(blackboard, 'tribeAnalysis_existingStorageSpots');
      if (existingStorageSpots === undefined) {
        return [NodeStatus.FAILURE, 'No tribe analysis available'];
      }

      const needsFirstStorage = existingStorageSpots === 0;
      const minDistanceFromOtherTribes = needsFirstStorage
        ? LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER
        : LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER;

      const placementLocation = findAdjacentBuildingPlacement(
        BuildingType.StorageSpot,
        entity.id,
        context.gameState,
        LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
        minDistanceFromOtherTribes,
        entity.position, // Prioritize locations near leader
      );

      if (!placementLocation) {
        return [
          NodeStatus.FAILURE,
          `No valid location found for storage within ${LEADER_BUILDING_SPIRAL_SEARCH_RADIUS}px`,
        ];
      }

      // Store location in blackboard
      Blackboard.set(blackboard, 'buildingPlacement_storageTarget', placementLocation);

      return [
        NodeStatus.SUCCESS,
        `Found storage location at (${placementLocation.x.toFixed(0)}, ${placementLocation.y.toFixed(0)})`,
      ];
    },
    'Find Storage Location',
    depth + 2,
  );

  // Action: Move to storage placement location
  const moveToStorageLocationAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const targetLocation = Blackboard.get<Vector2D>(blackboard, 'buildingPlacement_storageTarget');

      if (!targetLocation) {
        return [NodeStatus.FAILURE, 'No target location in blackboard'];
      }

      const distance = calculateWrappedDistance(
        entity.position,
        targetLocation,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance <= LEADER_BUILDING_PLACEMENT_PROXIMITY) {
        // Close enough, proceed to placement
        return [NodeStatus.SUCCESS, `Reached storage location (${distance.toFixed(0)}px away)`];
      }

      // Move towards target
      entity.activeAction = 'moving';
      entity.target = targetLocation;
      entity.direction = dirToTarget(entity.position, targetLocation, context.gameState.mapDimensions);

      return [NodeStatus.RUNNING, `Moving to storage location (${distance.toFixed(0)}px away)`];
    },
    'Move To Storage Location',
    depth + 2,
  );

  // Action: Place storage
  const placeStorageAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const targetLocation = Blackboard.get<Vector2D>(blackboard, 'buildingPlacement_storageTarget');

      if (!targetLocation) {
        return [NodeStatus.FAILURE, 'No target location in blackboard'];
      }

      // Verify proximity one more time
      const distance = calculateWrappedDistance(
        entity.position,
        targetLocation,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance > LEADER_BUILDING_PLACEMENT_PROXIMITY) {
        return [NodeStatus.FAILURE, `Too far from placement location: ${distance.toFixed(0)}px`];
      }

      createBuilding(targetLocation, BuildingType.StorageSpot, entity.id, context.gameState);

      // Clear blackboard
      Blackboard.delete(blackboard, 'buildingPlacement_storageTarget');

      return [NodeStatus.SUCCESS, `Placed storage at (${targetLocation.x.toFixed(0)}, ${targetLocation.y.toFixed(0)})`];
    },
    'Place Storage',
    depth + 2,
  );

  const storageSequence = new Sequence<HumanEntity>(
    [needsStorageCondition, findStorageLocationAction, moveToStorageLocationAction, placeStorageAction],
    'Storage Sequence',
    depth + 1,
  );

  // --- Planting Zone Building Branch ---

  // Condition: Needs planting zone
  const needsPlantingZoneCondition = new ConditionNode<HumanEntity>(
    (_entity, _context, blackboard) => {
      const adultCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_adultCount');
      const existingPlantingZones = Blackboard.get<number>(blackboard, 'tribeAnalysis_existingPlantingZones');
      const bushDensity = Blackboard.get<number>(blackboard, 'tribeAnalysis_bushDensity');
      const bushCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_bushCount');
      const zoneDensity = Blackboard.get<number>(blackboard, 'tribeAnalysis_zoneDensity');
      const projectedAdultCount = Blackboard.get<number>(blackboard, 'tribeAnalysis_projectedAdultCount');

      if (
        adultCount === undefined ||
        existingPlantingZones === undefined ||
        bushDensity === undefined ||
        bushCount === undefined ||
        zoneDensity === undefined ||
        projectedAdultCount === undefined
      ) {
        return [false, 'No tribe analysis available'];
      }

      const projectedBushDensity = bushDensity * (adultCount / Math.max(1, projectedAdultCount));
      const needsFirstPlantingZone = existingPlantingZones === 0;

      const needsPlantingZone =
        needsFirstPlantingZone ||
        bushDensity < LEADER_BUILDING_MIN_BUSHES_PER_MEMBER ||
        projectedBushDensity < LEADER_BUILDING_MIN_BUSHES_PER_MEMBER ||
        (bushCount <= LEADER_BUILDING_MIN_BUSHES && existingPlantingZones <= LEADER_BUILDING_MIN_BUSHES);

      if (
        needsPlantingZone &&
        zoneDensity > projectedBushDensity &&
        (bushCount > LEADER_BUILDING_MIN_BUSHES || existingPlantingZones > LEADER_BUILDING_MIN_BUSHES)
      ) {
        return [
          false,
          `Planting zone density (${zoneDensity.toFixed(2)}) exceeds projected density (${projectedBushDensity.toFixed(
            2,
          )})`,
        ];
      }

      if (!needsPlantingZone) {
        return [false, `Planting zones adequate: ${existingPlantingZones}, density: ${bushDensity.toFixed(1)}`];
      }

      return [
        true,
        `Low bush density: ${bushDensity.toFixed(
          1,
        )}, count: ${bushCount}/${existingPlantingZones} (projected: ${projectedBushDensity.toFixed(1)})`,
      ];
    },
    'Needs Planting Zone',
    depth + 2,
  );

  // Action: Find planting zone placement location
  const findPlantingZoneLocationAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const placementLocation = findAdjacentBuildingPlacement(
        BuildingType.PlantingZone,
        entity.id,
        context.gameState,
        LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
        LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
        entity.position, // Prioritize locations near leader
      );

      if (!placementLocation) {
        return [
          NodeStatus.FAILURE,
          `No valid location found for planting zone within ${LEADER_BUILDING_SPIRAL_SEARCH_RADIUS}px`,
        ];
      }

      // Store location in blackboard
      Blackboard.set(blackboard, 'buildingPlacement_plantingTarget', placementLocation);

      return [
        NodeStatus.SUCCESS,
        `Found planting zone location at (${placementLocation.x.toFixed(0)}, ${placementLocation.y.toFixed(0)})`,
      ];
    },
    'Find Planting Zone Location',
    depth + 2,
  );

  // Action: Move to planting zone placement location
  const moveToPlantingZoneLocationAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const targetLocation = Blackboard.get<Vector2D>(blackboard, 'buildingPlacement_plantingTarget');

      if (!targetLocation) {
        return [NodeStatus.FAILURE, 'No target location in blackboard'];
      }

      const distance = calculateWrappedDistance(
        entity.position,
        targetLocation,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance <= LEADER_BUILDING_PLACEMENT_PROXIMITY) {
        // Close enough, proceed to placement
        return [NodeStatus.SUCCESS, `Reached planting zone location (${distance.toFixed(0)}px away)`];
      }

      // Move towards target
      entity.activeAction = 'moving';
      entity.target = targetLocation;
      entity.direction = dirToTarget(entity.position, targetLocation, context.gameState.mapDimensions);

      return [NodeStatus.RUNNING, `Moving to planting zone location (${distance.toFixed(0)}px away)`];
    },
    'Move To Planting Zone Location',
    depth + 2,
  );

  // Action: Place planting zone
  const placePlantingZoneAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      const targetLocation = Blackboard.get<Vector2D>(blackboard, 'buildingPlacement_plantingTarget');

      if (!targetLocation) {
        return [NodeStatus.FAILURE, 'No target location in blackboard'];
      }

      // Verify proximity one more time
      const distance = calculateWrappedDistance(
        entity.position,
        targetLocation,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance > LEADER_BUILDING_PLACEMENT_PROXIMITY) {
        return [NodeStatus.FAILURE, `Too far from placement location: ${distance.toFixed(0)}px`];
      }

      createBuilding(targetLocation, BuildingType.PlantingZone, entity.id, context.gameState);

      // Clear blackboard
      Blackboard.delete(blackboard, 'buildingPlacement_plantingTarget');

      return [
        NodeStatus.SUCCESS,
        `Placed planting zone at (${targetLocation.x.toFixed(0)}, ${targetLocation.y.toFixed(0)})`,
      ];
    },
    'Place Planting Zone',
    depth + 2,
  );

  const plantingZoneSequence = new Sequence<HumanEntity>(
    [
      needsPlantingZoneCondition,
      findPlantingZoneLocationAction,
      moveToPlantingZoneLocationAction,
      placePlantingZoneAction,
    ],
    'Planting Zone Sequence',
    depth + 1,
  );

  // Selector: Try storage first, then planting zone
  const buildingTypeSelector = new Selector<HumanEntity>(
    [storageSequence, plantingZoneSequence],
    'Building Type Selector',
    depth + 1,
  );

  // Main sequence: Check leader → Analyze tribe → Check size → Try to place building
  return new Sequence<HumanEntity>(
    [isLeaderCondition, cachedTribeAnalysis, hasMinimumTribeSizeCondition, buildingTypeSelector],
    'Leader Building Placement',
    depth,
  );
}

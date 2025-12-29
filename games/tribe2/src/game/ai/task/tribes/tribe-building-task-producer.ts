import { UpdateContext, GameWorldState } from '../../../world-types';
import { TaskType } from '../task-types';
import {
  getStorageUtilization,
  getTribeStorageSpots,
  getTribeBonfires,
  getProductiveBushes,
} from '../../../entities/tribe/tribe-food-utils';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils';
import { findAdjacentBuildingPlacement } from '../../../utils/building-placement-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import {
  LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD,
  LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
  LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
  LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
} from '../../../ai-consts';
import { getTribeCenter } from '../../../utils';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import {
  BONFIRE_PLACEMENT_TEMP_THRESHOLD,
  BONFIRE_TRIBE_SIZE_RATIO,
  COLD_THRESHOLD,
  BONFIRE_HEAT_RADIUS,
} from '../../../temperature/temperature-consts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findNearestTerritoryEdge } from '../../../entities/tribe/territory-utils';
import { TRIBE_BUILDINGS_MIN_HEADCOUNT } from '../../../entities/tribe/tribe-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { EntityId } from '../../../entities/entities-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Vector2D } from '../../../utils/math-types';

/**
 * Produces building placement tasks at the tribe level.
 * This function is called periodically (e.g., hourly) to evaluate tribe needs
 * and create tasks that any available tribe member can execute.
 */
export function produceTribeBuildingTasks(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // Identify all unique tribe leaders
  const allHumans = indexedState.search.human.all();
  const leaderIds = new Set<EntityId>();
  for (const human of allHumans) {
    if (human.leaderId && human.leaderId === human.id) {
      leaderIds.add(human.id);
    }
  }

  for (const leaderId of leaderIds) {
    const leader = gameState.entities.entities[leaderId] as HumanEntity;
    if (!leader) continue;

    const tribeMembers = getTribeMembers(leader, gameState);
    if (tribeMembers.length < TRIBE_BUILDINGS_MIN_HEADCOUNT) continue;

    const adultMembers = tribeMembers.filter((m) => m.isAdult);
    if (adultMembers.length === 0) continue;

    // Check existing tasks for this tribe to avoid duplicates
    const existingTasks = Object.values(gameState.tasks).filter((t) => t.creatorEntityId === leaderId);
    const hasActiveTask = (type: TaskType) => existingTasks.some((t) => t.type === type);

    // --- STORAGE ---
    if (!hasActiveTask(TaskType.HumanPlaceStorage)) {
      const existingStorage = getTribeStorageSpots(leaderId, gameState, true);
      const utilization = getStorageUtilization(leaderId, gameState);
      const needsStorage = existingStorage.length === 0 || utilization > LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD;

      if (needsStorage) {
        const minDistance =
          existingStorage.length === 0
            ? LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER
            : LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER;

        const spot = findAdjacentBuildingPlacement(
          BuildingType.StorageSpot,
          leaderId,
          gameState,
          LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
          minDistance,
          leader.position,
        );

        if (spot) {
          createPlacementTask(leaderId, TaskType.HumanPlaceStorage, spot, gameState);
        }
      }
    }

    // --- BONFIRE ---
    if (!hasActiveTask(TaskType.HumanPlaceBonfire)) {
      const bonfires = getTribeBonfires(leaderId, gameState, true);
      const tribeCenter = getTribeCenter(leaderId, gameState);
      const currentTemp = getTemperatureAt(
        gameState.temperature,
        tribeCenter,
        gameState.time,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      const needsFirstBonfire = currentTemp < BONFIRE_PLACEMENT_TEMP_THRESHOLD && bonfires.length === 0;
      const needsByRatio =
        bonfires.length > 0 && bonfires.length < Math.ceil(adultMembers.length / BONFIRE_TRIBE_SIZE_RATIO);

      // Cold clusters logic
      let coldClusterPos: Vector2D | undefined;
      const coldMembers = tribeMembers.filter((m) => {
        const localTemp = getTemperatureAt(
          gameState.temperature,
          m.position,
          gameState.time,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const isCold = localTemp < COLD_THRESHOLD + 5;
        if (!isCold) return false;

        // Far from any existing bonfire
        return bonfires.every((b) => {
          const dist = calculateWrappedDistance(
            m.position,
            b.position,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );
          return dist > BONFIRE_HEAT_RADIUS * 1.5;
        });
      });

      if (coldMembers.length >= 3) {
        const avgX = coldMembers.reduce((sum, m) => sum + m.position.x, 0) / coldMembers.length;
        const avgY = coldMembers.reduce((sum, m) => sum + m.position.y, 0) / coldMembers.length;
        coldClusterPos = { x: avgX, y: avgY };
      }

      if (needsFirstBonfire || needsByRatio || coldClusterPos) {
        const spot = findAdjacentBuildingPlacement(
          BuildingType.Bonfire,
          leaderId,
          gameState,
          LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
          LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
          coldClusterPos || leader.position,
        );
        if (spot) {
          createPlacementTask(leaderId, TaskType.HumanPlaceBonfire, spot, gameState);
        }
      }
    }

    // --- PLANTING ZONE ---
    if (!hasActiveTask(TaskType.HumanPlacePlantingZone)) {
      const { ratio: bushDensity } = getProductiveBushes(leaderId, gameState);
      if (bushDensity < LEADER_BUILDING_MIN_BUSHES_PER_MEMBER) {
        const spot = findAdjacentBuildingPlacement(
          BuildingType.PlantingZone,
          leaderId,
          gameState,
          LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
          LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
          leader.position,
        );
        if (spot) {
          createPlacementTask(leaderId, TaskType.HumanPlacePlantingZone, spot, gameState);
        }
      }
    }

    // --- BORDER POST ---
    if (!hasActiveTask(TaskType.HumanPlaceBorderPost)) {
      const expandBordersWeight = leader.tribeControl?.armyControl?.expandBorders ?? 0;
      if (expandBordersWeight >= 2) {
        const edge = findNearestTerritoryEdge(leader.position, leaderId, gameState);
        if (edge) {
          createPlacementTask(leaderId, TaskType.HumanPlaceBorderPost, edge, gameState);
        }
      }
    }
  }
}

/**
 * Helper to create and add a placement task to the game state.
 */
function createPlacementTask(leaderId: EntityId, type: TaskType, target: Vector2D, gameState: GameWorldState): void {
  const taskId = `${TaskType[type]}-${leaderId}-${gameState.time.toFixed(2)}`;
  gameState.tasks[taskId] = {
    id: taskId,
    type,
    creatorEntityId: leaderId,
    target,
    validUntilTime: gameState.time + 12, // Valid for 12 game hours
  };
}

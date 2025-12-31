import { UpdateContext, GameWorldState } from '../../../world-types';
import { TaskType, Task } from '../task-types';
import {
  calculatePlantingZoneCapacity,
} from '../../../entities/tribe/tribe-food-utils';
import { findAdjacentBuildingPlacement } from '../../../utils/building-placement-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import {
  LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD,
  LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
  LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
  LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_MIN_BUSHES,
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
import { BuildingEntity } from '../../../entities/buildings/building-types';

/**
 * Produces building placement tasks at the tribe level.
 * This function is called periodically (e.g., hourly) to evaluate tribe needs
 * and create tasks that any available tribe member can execute.
 */
export function produceTribeBuildingTasks(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // 1. Group humans by leaderId and identify leaders
  const allHumans = indexedState.search.human.all();
  const tribeMembersMap = new Map<EntityId, HumanEntity[]>();
  const leaderIds = new Set<EntityId>();

  for (let i = 0; i < allHumans.length; i++) {
    const human = allHumans[i];
    if (human.leaderId) {
      if (!tribeMembersMap.has(human.leaderId)) {
        tribeMembersMap.set(human.leaderId, []);
      }
      tribeMembersMap.get(human.leaderId)!.push(human);

      if (human.leaderId === human.id) {
        leaderIds.add(human.id);
      }
    }
  }

  // 2. Group tasks by creatorEntityId
  const allTasks = Object.values(gameState.tasks);
  const tasksByCreator = new Map<EntityId, Task[]>();
  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i];
    if (task.creatorEntityId) {
      if (!tasksByCreator.has(task.creatorEntityId)) {
        tasksByCreator.set(task.creatorEntityId, []);
      }
      tasksByCreator.get(task.creatorEntityId)!.push(task);
    }
  }

  // 3. Group buildings by tribe leader (ownerId)
  const allBuildings = indexedState.search.building.all();
  const buildingsByTribe = new Map<EntityId, BuildingEntity[]>();
  for (let i = 0; i < allBuildings.length; i++) {
    const building = allBuildings[i];
    if (building.ownerId) {
      const owner = gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
      const leaderId = owner?.leaderId;
      if (leaderId) {
        if (!buildingsByTribe.has(leaderId)) {
          buildingsByTribe.set(leaderId, []);
        }
        buildingsByTribe.get(leaderId)!.push(building);
      }
    }
  }

  // 4. Pre-calculate all tribe centers (leveraging cache in getTribeCenter)
  const tribeCenters = new Map<EntityId, Vector2D>();
  for (const leaderId of leaderIds) {
    tribeCenters.set(leaderId, getTribeCenter(leaderId, gameState));
  }

  // 5. Iterate through leaders and evaluate needs
  for (const leaderId of leaderIds) {
    const leader = gameState.entities.entities[leaderId] as HumanEntity;
    if (!leader) continue;

    const tribeMembers = tribeMembersMap.get(leaderId) || [];
    if (tribeMembers.length < TRIBE_BUILDINGS_MIN_HEADCOUNT) continue;

    const adultMembers = tribeMembers.filter((m) => m.isAdult);
    if (adultMembers.length === 0) continue;

    const existingTasks = tasksByCreator.get(leaderId) || [];
    const hasActiveTask = (type: TaskType) => existingTasks.some((t) => t.type === type);

    const tribeBuildings = buildingsByTribe.get(leaderId) || [];

    // Prepare other tribe centers for placement optimization
    const otherTribeCenters: Vector2D[] = [];
    for (const [tid, center] of tribeCenters.entries()) {
      if (tid !== leaderId) {
        otherTribeCenters.push(center);
      }
    }

    // --- STORAGE ---
    if (!hasActiveTask(TaskType.HumanPlaceStorage)) {
      const storageSpots = tribeBuildings.filter(b => b.buildingType === BuildingType.StorageSpot);
      
      // Calculate utilization
      let totalItems = 0;
      let totalCapacity = 0;
      for (let i = 0; i < storageSpots.length; i++) {
        const s = storageSpots[i];
        totalItems += s.storedItems?.length || 0;
        totalCapacity += s.storageCapacity || 0;
      }
      const utilization = totalCapacity > 0 ? totalItems / totalCapacity : 0;
      
      const needsStorage = storageSpots.length === 0 || utilization > LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD;

      if (needsStorage) {
        const minDistance =
          storageSpots.length === 0
            ? LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER
            : LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER;

        const spot = findAdjacentBuildingPlacement(
          BuildingType.StorageSpot,
          leaderId,
          gameState,
          LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
          minDistance,
          leader.position,
          otherTribeCenters,
        );

        if (spot) {
          createPlacementTask(leaderId, TaskType.HumanPlaceStorage, spot, gameState);
        }
      }
    }

    // --- BONFIRE ---
    if (!hasActiveTask(TaskType.HumanPlaceBonfire)) {
      const bonfires = tribeBuildings.filter(b => b.buildingType === BuildingType.Bonfire);
      const tribeCenter = tribeCenters.get(leaderId)!;
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
          otherTribeCenters,
        );
        if (spot) {
          createPlacementTask(leaderId, TaskType.HumanPlaceBonfire, spot, gameState);
        }
      }
    }

    // --- PLANTING ZONE ---
    if (!hasActiveTask(TaskType.HumanPlacePlantingZone)) {
      const plantingZones = tribeBuildings.filter(b => b.buildingType === BuildingType.PlantingZone);
      const currentCapacity = plantingZones.reduce((sum, zone) => sum + calculatePlantingZoneCapacity(zone), 0);
      const targetBushes = Math.max(
        LEADER_BUILDING_MIN_BUSHES,
        adultMembers.length * LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
      );

      if (currentCapacity < targetBushes) {
        const spot = findAdjacentBuildingPlacement(
          BuildingType.PlantingZone,
          leaderId,
          gameState,
          LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
          LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
          leader.position,
          otherTribeCenters,
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
    position: target,
    type,
    creatorEntityId: leaderId,
    target,
    validUntilTime: gameState.time + 12, // Valid for 12 game hours
  };
}

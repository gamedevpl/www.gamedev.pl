import { UpdateContext, GameWorldState } from '../../../world-types';
import { TaskType, Task } from '../task-types';
import { calculatePlantingZoneCapacity, isPlantingZoneViable } from '../../../entities/tribe/tribe-food-utils';
import { findAdjacentBuildingPlacement } from '../../../utils/building-placement-utils';
import { BuildingType } from '../../../entities/buildings/building-consts';
import {
  LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD,
  LEADER_BUILDING_MIN_BUSHES_PER_MEMBER,
  LEADER_BUILDING_SPIRAL_SEARCH_RADIUS,
  LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER,
  LEADER_BUILDING_MIN_BUSHES,
  GORD_GRID_RESOLUTION,
} from '../../../ai-consts';
import { getTribeCenter } from '../../../utils';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import {
  BONFIRE_PLACEMENT_TEMP_THRESHOLD,
  BONFIRE_TRIBE_SIZE_RATIO,
  COLD_THRESHOLD,
  BONFIRE_HEAT_RADIUS,
} from '../../../temperature/temperature-consts';
import { calculateWrappedDistance, calculateWrappedDistanceSq } from '../../../utils/math-utils';
import { convertTerritoryIndexToPosition } from '../../../entities/tribe/territory-utils';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';
import { TRIBE_BUILDINGS_MIN_HEADCOUNT } from '../../../entities/tribe/tribe-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { EntityId } from '../../../entities/entities-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Vector2D } from '../../../utils/math-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { isTribeHostile } from '../../../utils/human-utils';
import { Blackboard } from '../../behavior-tree/behavior-tree-blackboard';
import { NAV_GRID_RESOLUTION } from '../../../utils/navigation-utils';
import {
  findGordClusters,
  traceGordPerimeter,
  assignGates,
  GORD_WALL_PROXIMITY_THRESHOLD,
  filterUncoveredEdges,
  analyzeBorderCoverage,
  GORD_MIN_CELLS_FOR_SURROUNDING,
  GORD_UNSURROUNDED_THRESHOLD,
} from './gord-boundary-utils';

export type FrontierCandidate = {
  score: number;
  fromIdx: number;
  lastSeenTime: number;
};

const BLACKBOARD_OWNED_INDICES = 'ownedIndices';
const BLACKBOARD_FRONTIER_SCAN_INDEX = 'frontierScanIndex';
const BLACKBOARD_FRONTIER_CANDIDATES = 'frontierCandidates';

/**
 * Incrementally scans the tribe's border to identify expansion candidates.
 * Called every tick to spread the computation.
 */
export function updateTribeFrontier(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // 1. Identify tribe leaders
  const allHumans = indexedState.search.human.all();
  const leaders = allHumans.filter((h) => h.leaderId === h.id);

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  for (const leader of leaders) {
    if (!leader.aiBlackboard) continue;

    const ownedIndices = Blackboard.get<number[]>(leader.aiBlackboard, BLACKBOARD_OWNED_INDICES) || [];
    if (ownedIndices.length === 0) continue;

    let scanIndex = Blackboard.get<number>(leader.aiBlackboard, BLACKBOARD_FRONTIER_SCAN_INDEX) || 0;
    const candidates =
      Blackboard.get<Record<string, FrontierCandidate>>(leader.aiBlackboard, BLACKBOARD_FRONTIER_CANDIDATES) || {};

    const tribeCenter = getTribeCenter(leader.id, gameState);

    // Process 20 cells per tick
    const cellsToProcess = 20;
    for (let i = 0; i < cellsToProcess; i++) {
      // Ensure scanIndex is within bounds
      if (scanIndex >= ownedIndices.length) {
        scanIndex = 0;
      }

      const idx = ownedIndices[scanIndex];
      scanIndex = (scanIndex + 1) % ownedIndices.length;

      const gx = idx % gridWidth;
      const gy = Math.floor(idx / gridWidth);

      // Check 4 cardinal neighbors
      const neighbors = [
        { dx: 0, dy: -1 }, // Top
        { dx: 1, dy: 0 }, // Right
        { dx: 0, dy: 1 }, // Bottom
        { dx: -1, dy: 0 }, // Left
      ];

      for (const { dx, dy } of neighbors) {
        const nx = (gx + dx + gridWidth) % gridWidth;
        const ny = (gy + dy + gridHeight) % gridHeight;

        const targetIdx = ny * gridWidth + nx;

        const neighborOwner = gameState.terrainOwnership[targetIdx];
        const isHostile = neighborOwner !== null && isTribeHostile(leader.id, neighborOwner, gameState);

        // If neighbor is unowned or hostile, it's a frontier cell
        if (neighborOwner === null || isHostile) {
          // 1. Smoothing Score (Convexity)
          // Count how many of targetIdx's neighbors are already owned by us
          let ownedNeighborCount = 0;
          for (const { dx: ddx, dy: ddy } of neighbors) {
            const nnx = (nx + ddx + gridWidth) % gridWidth;
            const nny = (ny + ddy + gridHeight) % gridHeight;
            if (gameState.terrainOwnership[nny * gridWidth + nnx] === leader.id) {
              ownedNeighborCount++;
            }
          }
          const smoothingScore = ownedNeighborCount * 20;

          // 2. Strategic Score (Resources)
          const targetPos = convertTerritoryIndexToPosition(targetIdx, worldWidth);
          const bushes = indexedState.search.berryBush.byRadius(targetPos, 100);
          const trees = indexedState.search.tree.byRadius(targetPos, 100);
          const resourceScore = bushes.length * 10 + trees.length * 5;

          const hostilityScore = isHostile ? 50 : 0;

          // 3. Distance Penalty
          const dist = calculateWrappedDistance(targetPos, tribeCenter, worldWidth, worldHeight);
          const distPenalty = (dist / 100) * 5;

          const totalScore = smoothingScore + resourceScore + hostilityScore - distPenalty;

          candidates[targetIdx.toString()] = {
            score: totalScore,
            fromIdx: idx,
            lastSeenTime: gameState.time,
          };
        }
      }
    }

    // Keep top 50 candidates to prevent bloat
    const sortedEntries = Object.entries(candidates).sort((a, b) => b[1].score - a[1].score);
    if (sortedEntries.length > 50) {
      const cappedCandidates: Record<string, FrontierCandidate> = {};
      for (let j = 0; j < 50; j++) {
        const [idxStr, cand] = sortedEntries[j];
        cappedCandidates[idxStr] = cand;
      }
      Blackboard.set(leader.aiBlackboard, BLACKBOARD_FRONTIER_CANDIDATES, cappedCandidates);
    } else {
      Blackboard.set(leader.aiBlackboard, BLACKBOARD_FRONTIER_CANDIDATES, candidates);
    }

    Blackboard.set(leader.aiBlackboard, BLACKBOARD_FRONTIER_SCAN_INDEX, scanIndex);
  }
}

/**
 * Plans defensive enclosures (Gords) around critical infrastructure using influence map boundary tracing.
 * 
 * New algorithm:
 * 1. Periodically check how much of the tribe territory border is NOT surrounded by gord
 * 2. If the unsurrounded percentage is above threshold, prioritize placing palisades
 * 3. Filter out edges that are already covered by existing palisades (reuse)
 * 4. Avoid surrounding very small territories
 * 5. Place gates strategically but not too many
 * 
 * @returns BorderCoverageResult for the leader to use in expansion decisions
 */
function planGords(leaderId: EntityId, tribeBuildings: BuildingEntity[], context: UpdateContext): { shouldPauseExpansion: boolean } {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;
  const { width, height } = gameState.mapDimensions;

  // 1. Clear existing palisade/gate tasks for the leader first to prevent ghost walls
  Object.keys(gameState.tasks).forEach((taskId) => {
    const task = gameState.tasks[taskId];
    if (
      task.creatorEntityId === leaderId &&
      (task.type === TaskType.HumanPlacePalisade || task.type === TaskType.HumanPlaceGate)
    ) {
      delete gameState.tasks[taskId];
    }
  });

  // Gather all hub buildings
  const hubs = tribeBuildings.filter(
    (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
  );

  if (hubs.length === 0) return { shouldPauseExpansion: false };

  // Gather existing walls for gord expansion and reuse
  const existingWalls = tribeBuildings.filter(
    (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
  );

  // 2. Identify 100px grid clusters based on territory ownership
  const clusters = findGordClusters(hubs, leaderId, gameState);
  const gridWidth = Math.ceil(width / GORD_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / GORD_GRID_RESOLUTION);

  let shouldPauseExpansion = false;

  // Process each hub cluster independently
  for (const cluster of clusters) {
    // 3. Minimum size requirement - avoid surrounding very small territories
    // Use the stricter GORD_MIN_CELLS_FOR_SURROUNDING for actual palisade placement
    if (cluster.size < GORD_MIN_CELLS_FOR_SURROUNDING) continue;

    // 4. Analyze border coverage to determine if we need more palisades
    const coverage = analyzeBorderCoverage(cluster, existingWalls, gridWidth, gridHeight, width, height);
    
    // If the unsurrounded ratio is above threshold, we should pause expansion
    if (coverage.unsurroundedRatio > GORD_UNSURROUNDED_THRESHOLD) {
      shouldPauseExpansion = true;
    }

    // 5. Trace perimeter edges of the cluster
    const allEdges = traceGordPerimeter(cluster, gridWidth, gridHeight);
    if (allEdges.length === 0) continue;

    // 6. Filter out edges that are already covered by existing palisades (reuse existing walls)
    const uncoveredEdges = filterUncoveredEdges(allEdges, existingWalls, width, height);
    if (uncoveredEdges.length === 0) continue; // All edges are already covered

    // 7. Assign gates strategically along the uncovered edges
    // Gate count is based on the uncovered edges, not total edges
    const edgesWithGates = assignGates(uncoveredEdges);

    // 8. Create tasks by interpolating along each 100px edge
    for (const edge of edgesWithGates) {
      const step = 20; // Palisade placement interval (matches territory resolution)
      const numSteps = GORD_GRID_RESOLUTION / step;

      const dx = edge.to.x > edge.from.x ? step : edge.to.x < edge.from.x ? -step : 0;
      const dy = edge.to.y > edge.from.y ? step : edge.to.y < edge.from.y ? -step : 0;

      let segmentsToSkip = 0;

      for (let i = 0; i < numSteps; i++) {
        if (segmentsToSkip > 0) {
          segmentsToSkip--;
          continue;
        }

        // Calculate placement position (centered in the 20px segment)
        const pos = {
          x: (edge.from.x + dx * i + dx / 2 + width) % width,
          y: (edge.from.y + dy * i + dy / 2 + height) % height,
        };

        // Check if building already exists at this position
        const existing = indexedState.search.building.at(pos, NAV_GRID_RESOLUTION / 2);
        if (existing) continue;

        // Check for existing walls too close
        const tooCloseToWall = existingWalls.some(
          (wall) =>
            calculateWrappedDistanceSq(pos, wall.position, width, height) <
            GORD_WALL_PROXIMITY_THRESHOLD * GORD_WALL_PROXIMITY_THRESHOLD,
        );
        if (tooCloseToWall) continue;

        // Check for trees blocking placement
        const trees = indexedState.search.tree.byRadius(pos, NAV_GRID_RESOLUTION / 2);
        if (trees.length > 0) {
          const tree = trees[0];
          const chopTaskId = `Chop-Gord-${tree.id}`;
          if (!gameState.tasks[chopTaskId]) {
            gameState.tasks[chopTaskId] = {
              id: chopTaskId,
              type: TaskType.HumanChopTree,
              position: tree.position,
              creatorEntityId: leaderId,
              target: tree.id,
              validUntilTime: gameState.time + 12,
            };
          }
          continue;
        }

        // Determine building type (Place one gate at the start of a gate edge)
        const type = edge.isGate && i === 0 ? TaskType.HumanPlaceGate : TaskType.HumanPlacePalisade;
        const taskId = `${TaskType[type]}-${leaderId}-${Math.floor(pos.x)}-${Math.floor(pos.y)}`;

        gameState.tasks[taskId] = {
          id: taskId,
          type,
          position: pos,
          creatorEntityId: leaderId,
          target: pos,
          validUntilTime: gameState.time + 24,
        };

        // Gate occupies 3 segments (60px), Palisade occupies 1 segment (20px)
        segmentsToSkip = type === TaskType.HumanPlaceGate ? 2 : 0;
      }
    }
  }

  return { shouldPauseExpansion };
}

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

    // Snapshotting (Hourly): Refresh the list of owned grid indices
    const ownedIndices: number[] = [];
    for (let i = 0; i < gameState.terrainOwnership.length; i++) {
      if (gameState.terrainOwnership[i] === leaderId) {
        ownedIndices.push(i);
      }
    }
    Blackboard.set(leader.aiBlackboard, BLACKBOARD_OWNED_INDICES, ownedIndices);

    const tribeMembers = tribeMembersMap.get(leaderId) || [];
    if (tribeMembers.length < TRIBE_BUILDINGS_MIN_HEADCOUNT) continue;

    const adultMembers = tribeMembers.filter((m) => m.isAdult);
    if (adultMembers.length === 0) continue;

    const existingTasks = tasksByCreator.get(leaderId) || [];
    const hasActiveTask = (type: TaskType) => existingTasks.some((t) => t.type === type);

    const tribeBuildings = buildingsByTribe.get(leaderId) || [];

    // --- GORDS (Palisades & Gates) -----
    // planGords now returns whether expansion should be paused based on border coverage
    const { shouldPauseExpansion } = planGords(leaderId, tribeBuildings, context);

    // Prepare other tribe centers for placement optimization
    const otherTribeCenters: Vector2D[] = [];
    for (const [tid, center] of tribeCenters.entries()) {
      if (tid !== leaderId) {
        otherTribeCenters.push(center);
      }
    }

    // --- STORAGE -----
    if (!hasActiveTask(TaskType.HumanPlaceStorage)) {
      const storageSpots = tribeBuildings.filter((b) => b.buildingType === BuildingType.StorageSpot);

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

    // --- BONFIRE -----
    if (!hasActiveTask(TaskType.HumanPlaceBonfire)) {
      const bonfires = tribeBuildings.filter((b) => b.buildingType === BuildingType.Bonfire);
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

    // --- PLANTING ZONE -----
    if (!hasActiveTask(TaskType.HumanPlacePlantingZone)) {
      const plantingZones = tribeBuildings.filter(
        (b) => b.buildingType === BuildingType.PlantingZone && isPlantingZoneViable(b, gameState),
      );
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

    // --- BORDER POST -----
    // Skip border post placement if the tribe needs to prioritize palisade placement
    // This ensures the tribe secures its current territory before expanding further
    if (!shouldPauseExpansion) {
      const candidates =
        Blackboard.get<Record<string, FrontierCandidate>>(leader.aiBlackboard, BLACKBOARD_FRONTIER_CANDIDATES) || {};
      const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

      const borderPosts = tribeBuildings.filter((b) => b.buildingType === BuildingType.BorderPost);
      const activeBorderTasks = existingTasks.filter((t) => t.type === TaskType.HumanPlaceBorderPost);

      // Pruning Candidates (Hourly)
      for (const targetIdxStr in candidates) {
        const targetIdx = parseInt(targetIdxStr, 10);
        const neighborOwner = gameState.terrainOwnership[targetIdx];
        const isHostile = neighborOwner !== null && isTribeHostile(leader.id, neighborOwner, gameState);

        // 1. Remove if no longer unowned/hostile or captured by us
        if (neighborOwner === leaderId || (neighborOwner !== null && !isHostile)) {
          delete candidates[targetIdxStr];
          continue;
        }

        // 2. Remove if too close to existing border posts or tasks
        const targetPos = convertTerritoryIndexToPosition(targetIdx, worldWidth);
        const isTooClose =
          borderPosts.some(
            (p) => calculateWrappedDistanceSq(targetPos, p.position, worldWidth, worldHeight) < 100 * 100,
          ) ||
          activeBorderTasks.some(
            (t) => calculateWrappedDistanceSq(targetPos, t.position, worldWidth, worldHeight) < 100 * 100,
          );

        if (isTooClose) {
          delete candidates[targetIdxStr];
        }
      }
      Blackboard.set(leader.aiBlackboard, BLACKBOARD_FRONTIER_CANDIDATES, candidates);

      const maxConcurrentTasks = 3;
      if (activeBorderTasks.length < maxConcurrentTasks) {
        // Sort and select top candidates
        const sortedCandidates = Object.entries(candidates)
          .map(([idx, cand]) => ({ idx: parseInt(idx, 10), ...cand }))
          .sort((a, b) => b.score - a.score);

        const selectedPositions: Vector2D[] = [];
        for (const candidate of sortedCandidates) {
          if (selectedPositions.length >= maxConcurrentTasks - activeBorderTasks.length) break;

          const targetPos = convertTerritoryIndexToPosition(candidate.idx, worldWidth);

          const isFarEnough = selectedPositions.every(
            (pos) => calculateWrappedDistanceSq(targetPos, pos, worldWidth, worldHeight) > 100 * 100,
          );

          if (isFarEnough) {
            selectedPositions.push(targetPos);
          }
        }

        // Identify available indices for stable task IDs
        const usedIndices = new Set(
          activeBorderTasks
            .map((t) => {
              const parts = t.id.split('-');
              return parseInt(parts[parts.length - 1], 10);
            })
            .filter((idx) => !isNaN(idx)),
        );

        const availableIndices: number[] = [];
        for (let i = 0; i < maxConcurrentTasks; i++) {
          if (!usedIndices.has(i)) {
            availableIndices.push(i);
          }
        }

        // Create tasks for selected candidates
        for (let i = 0; i < selectedPositions.length; i++) {
          createPlacementTask(
            leaderId,
            TaskType.HumanPlaceBorderPost,
            selectedPositions[i],
            gameState,
            availableIndices[i],
          );
        }
      }
    }
  }
}

/**
 * Helper to create and add a placement task to the game state.
 */
function createPlacementTask(
  leaderId: EntityId,
  type: TaskType,
  target: Vector2D,
  gameState: GameWorldState,
  index: number = 0,
) {
  const taskId = `${TaskType[type]}-${leaderId}-${index}`;
  gameState.tasks[taskId] = {
    id: taskId,
    position: target,
    type,
    creatorEntityId: leaderId,
    target,
    validUntilTime: gameState.time + 12, // Valid for 12 game hours
  };
}

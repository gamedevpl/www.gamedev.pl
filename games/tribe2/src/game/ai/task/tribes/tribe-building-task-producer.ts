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
} from '../../../ai-consts';
import { getTribeCenter } from '../../../utils';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import {
  BONFIRE_PLACEMENT_TEMP_THRESHOLD,
  BONFIRE_TRIBE_SIZE_RATIO,
  COLD_THRESHOLD,
  BONFIRE_HEAT_RADIUS,
} from '../../../temperature/temperature-consts';
import {
  calculateWrappedDistance,
  calculateWrappedDistanceSq,
  getDirectionVectorOnTorus,
} from '../../../utils/math-utils';
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
import { NAV_GRID_RESOLUTION, getNavigationGridCoords } from '../../../utils/navigation-utils';

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
 * Groups buildings that are close to each other into clusters.
 */
function clusterHubs(hubs: BuildingEntity[], worldWidth: number, worldHeight: number): BuildingEntity[][] {
  const clusters: BuildingEntity[][] = [];
  const visited = new Set<number>();
  const CLUSTER_DISTANCE_SQ = 150 * 150;

  for (let i = 0; i < hubs.length; i++) {
    if (visited.has(i)) continue;
    const cluster: BuildingEntity[] = [hubs[i]];
    visited.add(i);

    const queue = [hubs[i]];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (let j = 0; j < hubs.length; j++) {
        if (visited.has(j)) continue;
        const distSq = calculateWrappedDistanceSq(current.position, hubs[j].position, worldWidth, worldHeight);
        if (distSq < CLUSTER_DISTANCE_SQ) {
          visited.add(j);
          cluster.push(hubs[j]);
          queue.push(hubs[j]);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * Plans defensive enclosures (Gords) around critical infrastructure.
 */
function planGords(leaderId: EntityId, tribeBuildings: BuildingEntity[], context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / NAV_GRID_RESOLUTION);

  const hubs = tribeBuildings.filter(
    (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
  );

  const clusters = clusterHubs(hubs, width, height);

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    // Find bounding box in grid space relative to the first hub
    const ref = cluster[0].position;
    const refCoords = getNavigationGridCoords(ref, width, height);

    let minRelGX = 0,
      maxRelGX = 0,
      minRelGY = 0,
      maxRelGY = 0;
    for (const hub of cluster) {
      const dir = getDirectionVectorOnTorus(ref, hub.position, width, height);
      const relGX = Math.round(dir.x / NAV_GRID_RESOLUTION);
      const relGY = Math.round(dir.y / NAV_GRID_RESOLUTION);
      minRelGX = Math.min(minRelGX, relGX);
      maxRelGX = Math.max(maxRelGX, relGX);
      minRelGY = Math.min(minRelGY, relGY);
      maxRelGY = Math.max(maxRelGY, relGY);
    }

    const margin = 12;
    const startRelGX = minRelGX - margin;
    const endRelGX = maxRelGX + margin;
    const startRelGY = minRelGY - margin;
    const endRelGY = maxRelGY + margin;

    const perimeterPositions: Vector2D[] = [];
    const addPos = (rgx: number, rgy: number) => {
      const gx = (refCoords.x + rgx + gridWidth) % gridWidth;
      const gy = (refCoords.y + rgy + gridHeight) % gridHeight;
      perimeterPositions.push({
        x: gx * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
        y: gy * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      });
    };

    // Generate perimeter in a continuous clockwise sequence
    // 1. Top edge: Left to Right
    for (let rgx = startRelGX; rgx <= endRelGX; rgx++) addPos(rgx, startRelGY);
    // 2. Right edge: Top+1 to Bottom
    for (let rgy = startRelGY + 1; rgy <= endRelGY; rgy++) addPos(endRelGX, rgy);
    // 3. Bottom edge: Right-1 to Left
    for (let rgx = endRelGX - 1; rgx >= startRelGX; rgx--) addPos(rgx, endRelGY);
    // 4. Left edge: Bottom-1 to Top+1
    for (let rgy = endRelGY - 1; rgy > startRelGY; rgy--) addPos(startRelGX, rgy);

    // Find the point closest to the tribe center to start the sequence (ideal gate location)
    const tribeCenter = getTribeCenter(leaderId, gameState);
    let bestIdx = 0;
    let minDistSq = Infinity;
    for (let i = 0; i < perimeterPositions.length; i++) {
      const dSq = calculateWrappedDistanceSq(perimeterPositions[i], tribeCenter, width, height);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestIdx = i;
      }
    }

    // Rotate the sequence so it starts at the best point
    const rotatedPerimeter = [...perimeterPositions.slice(bestIdx), ...perimeterPositions.slice(0, bestIdx)];

    for (let i = 0; i < rotatedPerimeter.length; i++) {
      const pos = rotatedPerimeter[i];
      const coordKey = `${Math.floor(pos.x)}-${Math.floor(pos.y)}`;

      const existing = indexedState.search.building.at(pos, NAV_GRID_RESOLUTION / 2);
      if (existing) continue;

      const existingTask = Object.values(gameState.tasks).find(
        (t) =>
          (t.type === TaskType.HumanPlacePalisade || t.type === TaskType.HumanPlaceGate) &&
          calculateWrappedDistanceSq(t.position, pos, width, height) < 5 * 5,
      );
      if (existingTask) continue;

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

      // Place a 2-segment wide gate (40px) every 20 segments (200px)
      const isGate = i % 20 === 0 || i % 20 === 1;
      const type = isGate ? TaskType.HumanPlaceGate : TaskType.HumanPlacePalisade;
      const taskId = `${TaskType[type]}-${leaderId}-${coordKey}`;

      gameState.tasks[taskId] = {
        id: taskId,
        type,
        position: pos,
        creatorEntityId: leaderId,
        target: pos,
        validUntilTime: gameState.time + 24,
      };
    }
  }
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
    planGords(leaderId, tribeBuildings, context);

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

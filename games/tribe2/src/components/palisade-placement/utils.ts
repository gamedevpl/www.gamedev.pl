import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../../game/entities/buildings/building-consts';
import { Blackboard } from '../../game/ai/behavior-tree/behavior-tree-blackboard';
import { calculateWrappedDistance, calculateWrappedDistanceSq } from '../../game/utils/math-utils';
import { NAV_GRID_RESOLUTION } from '../../game/utils/navigation-utils';
import { Vector2D } from '../../game/utils/math-types';
import { GameWorldState } from '../../game/world-types';
import { getOwnerOfPoint } from '../../game/entities/tribe/territory-utils';
import { IndexedWorldState } from '../../game/world-index/world-index-types';
import {
  createInfluenceMap,
  traceAllPerimeters,
  assignGates,
  clusterHubs,
  GORD_HUB_CLUSTER_RADIUS,
  GORD_WALL_PROXIMITY_THRESHOLD,
} from '../../game/ai/task/tribes/gord-boundary-utils';
import { PlannedGordPosition, GordPlanStats } from './types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFENSE_EFFICIENCY_EXCELLENT,
  DEFENSE_EFFICIENCY_GOOD,
  DEFENSE_EFFICIENCY_FAIR,
  COMPACTNESS_EXCELLENT,
  COMPACTNESS_GOOD,
  COMPACTNESS_FAIR,
  ACCESSIBILITY_MIN_OPTIMAL,
  ACCESSIBILITY_MAX_OPTIMAL,
  ACCESSIBILITY_MIN_ACCEPTABLE,
  ACCESSIBILITY_MAX_ACCEPTABLE,
  QUALITY_EXCELLENT_THRESHOLD,
  QUALITY_GOOD_THRESHOLD,
  QUALITY_FAIR_THRESHOLD,
} from './constants';

export const createMockWorldState = (
  buildings: BuildingEntity[],
  terrainOwnership: (number | null)[],
): GameWorldState => {
  const entitiesMap: Record<number, unknown> = buildings.reduce(
    (acc, b) => {
      acc[b.id] = b;
      return acc;
    },
    {} as Record<number, unknown>,
  );

  // Mock player leader
  entitiesMap[1] = {
    id: 1,
    type: 'human',
    leaderId: 1,
    isPlayer: true,
    tribeInfo: { tribeBadge: '👑', tribeColor: '#4CAF50' },
    position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    radius: 10,
    isAdult: true,
    gender: 'male',
    age: 25,
    stateMachine: ['', { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
    debuffs: [],
    forces: [],
    velocity: { x: 0, y: 0 },
    acceleration: 0,
    direction: { x: 0, y: 0 },
  };

  const state = {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: { entities: entitiesMap },
    terrainOwnership,
    notifications: [],
    visualEffects: [],
    tutorialState: { isActive: false, highlightedEntityIds: [], activeUIHighlights: [] },
    plantingZoneConnections: {},
    navigationGrid: {
      obstacleCount: new Uint16Array(0),
      paddingCount: new Uint16Array(0),
      gateRefCount: {},
      gatePaddingRefCount: {},
    },
    tasks: {},
    soilDepletion: {},
  } as unknown as GameWorldState;

  // Add search functionality
  (state as unknown as IndexedWorldState).search = {
    building: {
      all: () => buildings,
      byRadius: (pos: Vector2D, radius: number) =>
        buildings.filter((b) => calculateWrappedDistance(pos, b.position, CANVAS_WIDTH, CANVAS_HEIGHT) <= radius),
      byRect: () => buildings,
      byProperty: (prop: string, value: unknown) =>
        buildings.filter((b) => (b as unknown as Record<string, unknown>)[prop] === value),
      at: (pos: Vector2D, radius: number) =>
        buildings.find((b) => calculateWrappedDistance(pos, b.position, CANVAS_WIDTH, CANVAS_HEIGHT) <= radius),
    } as unknown as IndexedWorldState['search']['building'],
    human: {
      all: () => [entitiesMap[1]],
      byProperty: () => [],
      byRadius: () => [],
      byRect: () => [entitiesMap[1]],
    } as unknown as IndexedWorldState['search']['human'],
    berryBush: {
      byRect: () => [],
      all: () => [],
      byRadius: () => [],
    } as unknown as IndexedWorldState['search']['berryBush'],
    tree: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexedWorldState['search']['tree'],
    corpse: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['corpse'],
    prey: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['prey'],
    predator: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['predator'],
    tasks: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['tasks'],
  };

  (state as unknown as IndexedWorldState).cache = { tribeCenters: {} } as unknown as IndexedWorldState['cache'];

  return state;
};

/**
 * Plans a gord around hub buildings using the new multi-loop and area-filtering logic.
 */
export function planGordPerimeter(
  hubs: BuildingEntity[],
  existingBuildings: BuildingEntity[],
  safeRadius: number,
  terrainOwnership: (number | null)[],
): PlannedGordPosition[] {
  if (hubs.length === 0) return [];

  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const gridWidth = Math.ceil(width / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / NAV_GRID_RESOLUTION);

  const existingWalls = existingBuildings.filter(
    (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
  );

  // Cluster nearby hubs so they share a single gord
  const hubClusters = clusterHubs(hubs, GORD_HUB_CLUSTER_RADIUS, width, height);

  const allPlanned: PlannedGordPosition[] = [];

  // Process each hub cluster independently
  for (const hubCluster of hubClusters) {
    if (hubCluster.length === 0) continue;

    // Calculate tribe center for this cluster
    const clusterCenter = {
      x: hubCluster.reduce((sum, h) => sum + h.position.x, 0) / hubCluster.length,
      y: hubCluster.reduce((sum, h) => sum + h.position.y, 0) / hubCluster.length,
    };

    // 1. Create influence map for this cluster only (Fix Onion Effect: ignore walls in grid calculation)
    const influenceMap = createInfluenceMap(hubCluster, width, height, safeRadius);

    // 2. Trace all loops (Fix Holes: traceAllPerimeters filters holes internally now)
    const allLoops = traceAllPerimeters(influenceMap, gridWidth, gridHeight);

    if (allLoops.length === 0) continue;

    for (const loop of allLoops) {
      // 3. Assign gates to FULL loop for stability
      const loopWithGates = assignGates(loop, clusterCenter, width, height);

      // 4. Filter loop by territory and existing walls
      const filtered = loopWithGates.filter((planned) => {
        const owner = getOwnerOfPoint(planned.position.x, planned.position.y, {
          terrainOwnership,
          mapDimensions: { width, height },
        } as unknown as GameWorldState);

        if (owner !== 1) return false;

        const tooClose = existingWalls.some(
          (wall) =>
            calculateWrappedDistanceSq(planned.position, wall.position, width, height) <
            GORD_WALL_PROXIMITY_THRESHOLD * GORD_WALL_PROXIMITY_THRESHOLD,
        );

        return !tooClose;
      });

      allPlanned.push(...filtered);
    }
  }

  return allPlanned;
}

/**
 * Calculates statistics and quality metrics for a planned gord.
 */
export function calculateGordStats(
  plannedPositions: PlannedGordPosition[],
  hubs: BuildingEntity[],
  safeRadius: number,
): GordPlanStats {
  const palisadeCount = plannedPositions.filter((p) => !p.isGate).length;
  const gateCount = plannedPositions.filter((p) => p.isGate).length;
  const totalSegments = plannedPositions.length;

  let perimeterLength = 0;
  for (let i = 0; i < plannedPositions.length; i++) {
    const p1 = plannedPositions[i].position;
    const p2 = plannedPositions[(i + 1) % plannedPositions.length].position;
    perimeterLength += calculateWrappedDistance(p1, p2, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  let enclosedArea = 0;
  for (let i = 0; i < plannedPositions.length; i++) {
    const p1 = plannedPositions[i].position;
    const p2 = plannedPositions[(i + 1) % plannedPositions.length].position;
    enclosedArea += p1.x * p2.y - p2.x * p1.y;
  }
  enclosedArea = Math.abs(enclosedArea) / 2;

  let totalProtectionDistance = 0;
  for (const planned of plannedPositions) {
    let minDistToHub = Infinity;
    for (const hub of hubs) {
      const dist = calculateWrappedDistance(planned.position, hub.position, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (dist < minDistToHub) minDistToHub = dist;
    }
    totalProtectionDistance += minDistToHub;
  }

  const averageProtectionDistance =
    plannedPositions.length > 0 ? Math.round(totalProtectionDistance / plannedPositions.length) : 0;
  const protectionScore = safeRadius > 0 ? averageProtectionDistance / safeRadius : 0;
  const defenseEfficiency = palisadeCount > 0 ? enclosedArea / palisadeCount : 0;
  const compactness = perimeterLength > 0 ? (4 * Math.PI * enclosedArea) / (perimeterLength * perimeterLength) : 0;
  const accessibilityScore = totalSegments > 0 ? gateCount / totalSegments : 0;

  const palisadeWoodCost = BUILDING_DEFINITIONS[BuildingType.Palisade].cost?.wood ?? 1;
  const gateWoodCost = BUILDING_DEFINITIONS[BuildingType.Gate].cost?.wood ?? 3;
  const woodCost = palisadeCount * palisadeWoodCost + gateCount * gateWoodCost;

  let qualityScore = 0;
  if (defenseEfficiency > DEFENSE_EFFICIENCY_EXCELLENT) qualityScore += 30;
  else if (defenseEfficiency > DEFENSE_EFFICIENCY_GOOD) qualityScore += 20;
  else if (defenseEfficiency > DEFENSE_EFFICIENCY_FAIR) qualityScore += 10;

  if (compactness > COMPACTNESS_EXCELLENT) qualityScore += 30;
  else if (compactness > COMPACTNESS_GOOD) qualityScore += 20;
  else if (compactness > COMPACTNESS_FAIR) qualityScore += 10;

  if (accessibilityScore >= ACCESSIBILITY_MIN_OPTIMAL && accessibilityScore <= ACCESSIBILITY_MAX_OPTIMAL)
    qualityScore += 25;
  else if (accessibilityScore > ACCESSIBILITY_MIN_ACCEPTABLE && accessibilityScore < ACCESSIBILITY_MAX_ACCEPTABLE)
    qualityScore += 15;

  if (protectionScore >= 0.8 && protectionScore <= 1.2) qualityScore += 20;

  let qualityRating: GordPlanStats['qualityRating'];
  if (qualityScore >= QUALITY_EXCELLENT_THRESHOLD) qualityRating = 'Excellent';
  else if (qualityScore >= QUALITY_GOOD_THRESHOLD) qualityRating = 'Good';
  else if (qualityScore >= QUALITY_FAIR_THRESHOLD) qualityRating = 'Fair';
  else qualityRating = 'Poor';

  return {
    perimeterLength: Math.round(perimeterLength),
    palisadeCount,
    gateCount,
    hubCount: hubs.length,
    enclosedArea: Math.round(enclosedArea),
    defenseEfficiency: Math.round(defenseEfficiency),
    compactness: Math.round(compactness * 100) / 100,
    accessibilityScore: Math.round(accessibilityScore * 1000) / 1000,
    woodCost,
    qualityRating,
    protectionScore: Math.round(protectionScore * 100) / 100,
    averageProtectionDistance,
  };
}

export const createBuildingEntity = (
  id: number,
  buildingType: BuildingType,
  position: { x: number; y: number },
  ownerId: number,
): BuildingEntity => {
  const definition = BUILDING_DEFINITIONS[buildingType];
  return {
    id,
    type: 'building',
    buildingType,
    position,
    ownerId,
    constructionProgress: 1,
    destructionProgress: 0,
    isConstructed: true,
    isBeingDestroyed: false,
    width: definition.dimensions.width,
    height: definition.dimensions.height,
    storedItems: [],
    storageCapacity: 10,
    radius: Math.max(definition.dimensions.width, definition.dimensions.height) / 2,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    stateMachine: ['', { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
  } as BuildingEntity;
};

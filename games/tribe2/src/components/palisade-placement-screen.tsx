import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import {
  BuildingType,
  BUILDING_DEFINITIONS,
  BORDER_EXPANSION_PAINT_RADIUS,
} from '../game/entities/buildings/building-consts';
import { renderBuilding, renderGhostBuilding } from '../game/render/render-building';
import { IndexedWorldState } from '../game/world-index/world-index-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';
import { calculateWrappedDistance, calculateWrappedDistanceSq } from '../game/utils/math-utils';
import { NAV_GRID_RESOLUTION } from '../game/utils/navigation-utils';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState } from '../game/world-types';
import { paintTerrainOwnership, getOwnerOfPoint } from '../game/entities/tribe/territory-utils';
import { renderAllTerritories } from '../game/render/render-territory';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../game/entities/tribe/territory-consts';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../game/utils/building-placement-utils';
import {
  createInfluenceMap,
  traceAllPerimeters,
  assignGates,
  clusterHubs,
  GORD_HUB_CLUSTER_RADIUS,
  GORD_WALL_PROXIMITY_THRESHOLD,
  GORD_DEFAULT_GATE_SPACING,
  GORD_MIN_GATE_DISTANCE_PX,
} from '../game/ai/task/tribes/gord-boundary-utils';

const ScreenContainer = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  color: white;
  font-family: 'Arial', sans-serif;
`;

const Sidebar = styled.div`
  width: 300px;
  height: 100%;
  background-color: #222;
  border-right: 1px solid #444;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
`;

const CanvasContainer = styled.div`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Canvas = styled.canvas`
  background-color: #2c5234;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  border: 2px solid #444;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  margin-bottom: 20px;
  text-align: center;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  margin: 15px 0 10px;
  color: #aaa;
`;

const Button = styled.button`
  background-color: #444;
  color: white;
  border: none;
  padding: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  transition: background-color 0.2s;

  &:hover {
    background-color: #666;
  }

  &:active {
    background-color: #888;
  }
`;

const BackButton = styled(Button)`
  background-color: #833;
  margin-top: auto;
  text-align: center;
  font-weight: bold;

  &:hover {
    background-color: #a44;
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  cursor: pointer;

  input {
    margin-right: 8px;
  }
`;

const InfoText = styled.p`
  font-size: 0.85rem;
  color: #888;
  margin: 5px 0;
`;

const QualityBadge = styled.span<{ $rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.75rem;
  background-color: ${(props) => {
    switch (props.$rating) {
      case 'Excellent':
        return '#2a5';
      case 'Good':
        return '#28a';
      case 'Fair':
        return '#a82';
      case 'Poor':
        return '#a33';
    }
  }};
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Types for gord planning
interface PlannedGordPosition {
  position: Vector2D;
  isGate: boolean;
}

interface GordPlanStats {
  perimeterLength: number;
  palisadeCount: number;
  gateCount: number;
  hubCount: number;
  enclosedArea: number;
  defenseEfficiency: number;
  compactness: number;
  accessibilityScore: number;
  protectionScore: number;
  averageProtectionDistance: number;
  woodCost: number;
  qualityRating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

// Default safe radius for gord perimeter (in pixels)
const DEFAULT_GORD_SAFE_RADIUS = 75;

// Quality scoring thresholds for gord evaluation
const DEFENSE_EFFICIENCY_EXCELLENT = 800;
const DEFENSE_EFFICIENCY_GOOD = 500;
const DEFENSE_EFFICIENCY_FAIR = 300;

const COMPACTNESS_EXCELLENT = 0.7;
const COMPACTNESS_GOOD = 0.5;
const COMPACTNESS_FAIR = 0.3;

const ACCESSIBILITY_MIN_OPTIMAL = 0.05;
const ACCESSIBILITY_MAX_OPTIMAL = 0.15;
const ACCESSIBILITY_MIN_ACCEPTABLE = 0.02;
const ACCESSIBILITY_MAX_ACCEPTABLE = 0.25;

const QUALITY_EXCELLENT_THRESHOLD = 80;
const QUALITY_GOOD_THRESHOLD = 60;
const QUALITY_FAIR_THRESHOLD = 40;

const createMockWorldState = (buildings: BuildingEntity[], terrainOwnership: (number | null)[]): GameWorldState => {
  const entitiesMap: Record<number, unknown> = buildings.reduce((acc, b) => {
    acc[b.id] = b;
    return acc;
  }, {} as Record<number, unknown>);

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
function planGordPerimeter(
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
function calculateGordStats(
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

const createBuildingEntity = (
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

export const PalisadePlacementScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Bonfire);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(10);
  const [showTerritoryGrid, setShowTerritoryGrid] = useState(true);
  const [showNavGrid, setShowNavGrid] = useState(false);
  const [showValidPlacement] = useState(true);
  const [showPlannedGord, setShowPlannedGord] = useState(true);
  const [gordSafeRadius, setGordSafeRadius] = useState(DEFAULT_GORD_SAFE_RADIUS);
  const [gateSpacing] = useState(GORD_DEFAULT_GATE_SPACING);
  const [plannedGordPositions, setPlannedGordPositions] = useState<PlannedGordPosition[]>([]);

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  const hubBuildings = useMemo(() => {
    return placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
    );
  }, [placedBuildings]);

  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedGordPositions.length === 0) return null;
    return calculateGordStats(plannedGordPositions, hubBuildings, gordSafeRadius);
  }, [plannedGordPositions, hubBuildings, gordSafeRadius]);

  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    const gridSize = NAV_GRID_RESOLUTION;
    return { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize };
  }, []);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const snappedPos = snapToGrid(x, y);
      const mockState = createMockWorldState(placedBuildings, terrainOwnership);

      if (!canPlaceBuilding(snappedPos, selectedType, 1, mockState)) return;

      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      const radius =
        selectedType === BuildingType.BorderPost ? BORDER_EXPANSION_PAINT_RADIUS : TERRITORY_BUILDING_RADIUS;

      paintTerrainOwnership(snappedPos, radius, 1, tempState);
      setTerrainOwnership(tempOwnership);

      if (selectedType !== BuildingType.BorderPost) {
        setPlacedBuildings((prev) => [...prev, newBuilding]);
      }
      setNextBuildingId((prev) => prev + 1);
    },
    [selectedType, nextBuildingId, snapToGrid, placedBuildings, terrainOwnership],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setMousePos(snapToGrid(x, y));
    },
    [snapToGrid],
  );

  const clearBuildings = useCallback(() => {
    setPlacedBuildings([]);
    setPlannedGordPositions([]);
    setNextBuildingId(10);
    setTerrainOwnership(new Array(terrainOwnership.length).fill(null));
  }, [terrainOwnership.length]);

  const planGord = useCallback(() => {
    if (hubBuildings.length === 0) {
      setPlannedGordPositions([]);
      return;
    }
    const allPositions = planGordPerimeter(hubBuildings, placedBuildings, gordSafeRadius, terrainOwnership);
    setPlannedGordPositions(allPositions);
  }, [hubBuildings, placedBuildings, gordSafeRadius, gateSpacing, terrainOwnership]);

  const executeGordPlan = useCallback(() => {
    if (plannedGordPositions.length === 0) return;
    const newBuildings: BuildingEntity[] = [];
    let currentId = nextBuildingId;
    const tempOwnership = [...terrainOwnership];
    const tempState = {
      mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      terrainOwnership: tempOwnership,
    } as GameWorldState;

    let segmentsToSkip = 0;
    for (let i = 0; i < plannedGordPositions.length; i++) {
      const planned = plannedGordPositions[i];

      // Update skip logic for gates
      if (planned.isGate) {
        segmentsToSkip = 0;
      }

      // Skip segments if we just placed a building
      if (segmentsToSkip > 0) {
        segmentsToSkip--;
        continue;
      }

      const buildingType = planned.isGate ? BuildingType.Gate : BuildingType.Palisade;
      const newBuilding = createBuildingEntity(currentId++, buildingType, planned.position, 1);
      newBuildings.push(newBuilding);
      paintTerrainOwnership(planned.position, TERRITORY_BUILDING_RADIUS, 1, tempState);

      // Set skip count: palisade = 0 (every cell), gate = 2 (occupies 3 cells)
      segmentsToSkip = planned.isGate ? 2 : 0;
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
    setPlannedGordPositions([]);
  }, [plannedGordPositions, nextBuildingId, terrainOwnership]);

  const autoPlaceSingleBuilding = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership);
    const humanPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    const position = findAdjacentBuildingPlacement(selectedType, 1, mockState, 200, 100, humanPos);

    if (position) {
      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, position, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      paintTerrainOwnership(position, TERRITORY_BUILDING_RADIUS, 1, tempState);
      setTerrainOwnership(tempOwnership);
      setPlacedBuildings((prev) => [...prev, newBuilding]);
      setNextBuildingId((prev) => prev + 1);
    }
  }, [placedBuildings, terrainOwnership, selectedType, nextBuildingId]);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const viewportCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
      const mockState = createMockWorldState(placedBuildings, terrainOwnership);

      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (showTerritoryGrid) {
        renderAllTerritories(ctx, mockState, viewportCenter, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, 1);
      }

      if (showNavGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= CANVAS_WIDTH; x += NAV_GRID_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, CANVAS_HEIGHT);
          ctx.stroke();
        }
        for (let y = 0; y <= CANVAS_HEIGHT; y += NAV_GRID_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(CANVAS_WIDTH, y);
          ctx.stroke();
        }
      }

      for (const building of placedBuildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      if (showPlannedGord && plannedGordPositions.length > 0) {
        ctx.save();
        for (let i = 0; i < plannedGordPositions.length; i++) {
          const planned = plannedGordPositions[i];
          const { x, y } = planned.position;
          const size = NAV_GRID_RESOLUTION;
          if (planned.isGate) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.7)';
            ctx.strokeStyle = '#4080FF';
          } else {
            ctx.fillStyle = 'rgba(180, 120, 60, 0.7)';
            ctx.strokeStyle = '#8B4513';
          }
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.lineWidth = 2;
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
          if (i < 5 || i === plannedGordPositions.length - 1) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), x, y);
          }
        }

        if (plannedGordPositions.length > 1) {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plannedGordPositions[0].position.x, plannedGordPositions[0].position.y);
          for (let i = 1; i < plannedGordPositions.length; i++) {
            const p1 = plannedGordPositions[i - 1].position;
            const p2 = plannedGordPositions[i].position;
            if (calculateWrappedDistanceSq(p1, p2, CANVAS_WIDTH, CANVAS_HEIGHT) < 100 * 100) {
              ctx.lineTo(p2.x, p2.y);
            } else {
              ctx.moveTo(p2.x, p2.y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      if (mousePos) {
        const canPlace = canPlaceBuilding(mousePos, selectedType, 1, mockState);
        const isValid = showValidPlacement ? canPlace : true;
        renderGhostBuilding(ctx, mousePos, selectedType, isValid, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
        if (showValidPlacement) {
          ctx.save();
          ctx.font = '12px Arial';
          ctx.fillStyle = canPlace ? '#00FF00' : '#FF0000';
          ctx.fillText(canPlace ? '✓ Valid placement' : '✗ Invalid placement', mousePos.x + 15, mousePos.y - 15);
          ctx.restore();
        }
      }
      requestRef.current = requestAnimationFrame(render);
    };
    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [
    placedBuildings,
    mousePos,
    selectedType,
    terrainOwnership,
    showTerritoryGrid,
    showNavGrid,
    showValidPlacement,
    showPlannedGord,
    plannedGordPositions,
  ]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Gord Builder Test</Title>
        <SectionTitle>1. Place Hub Buildings</SectionTitle>
        <Button
          onClick={() => setSelectedType(BuildingType.Bonfire)}
          style={{
            backgroundColor: selectedType === BuildingType.Bonfire ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Bonfire ? '3px solid #FF6600' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Bonfire].icon} Bonfire (Hub)
        </Button>
        <Button
          onClick={() => setSelectedType(BuildingType.StorageSpot)}
          style={{
            backgroundColor: selectedType === BuildingType.StorageSpot ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.StorageSpot ? '3px solid #FF6600' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.StorageSpot].icon} Storage (Hub)
        </Button>
        <SectionTitle>2. Manual Placement</SectionTitle>
        <Button
          onClick={() => setSelectedType(BuildingType.Palisade)}
          style={{
            backgroundColor: selectedType === BuildingType.Palisade ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Palisade ? '3px solid #4CAF50' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Palisade].icon} Palisade
        </Button>
        <Button
          onClick={() => setSelectedType(BuildingType.Gate)}
          style={{
            backgroundColor: selectedType === BuildingType.Gate ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Gate ? '3px solid #4CAF50' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Gate].icon} Gate
        </Button>
        <SectionTitle>3. AI Gord Planning</SectionTitle>
        <InfoText>Safe Radius: {gordSafeRadius}px</InfoText>
        <input
          type="range"
          min="40"
          max="120"
          value={gordSafeRadius}
          onChange={(e) => setGordSafeRadius(Number(e.target.value))}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <InfoText>Min Gate Dist: {GORD_MIN_GATE_DISTANCE_PX}px</InfoText>
        <Button
          onClick={planGord}
          style={{ backgroundColor: hubBuildings.length > 0 ? '#2a5' : '#555', textAlign: 'center' }}
          disabled={hubBuildings.length === 0}
        >
          🏰 Plan Gord ({hubBuildings.length} hubs)
        </Button>
        <Button
          onClick={executeGordPlan}
          style={{ backgroundColor: plannedGordPositions.length > 0 ? '#25a' : '#555', textAlign: 'center' }}
          disabled={plannedGordPositions.length === 0}
        >
          ✅ Execute Plan ({plannedGordPositions.length})
        </Button>
        <SectionTitle>Gord Statistics</SectionTitle>
        {gordStats ? (
          <>
            <InfoText>
              🎯 Quality: <QualityBadge $rating={gordStats.qualityRating}>{gordStats.qualityRating}</QualityBadge>
            </InfoText>
            <InfoText>
              🏠 Hubs: {gordStats.hubCount} | 🧱 Palis: {gordStats.palisadeCount} | 🚪 Gates: {gordStats.gateCount}
            </InfoText>
            <InfoText>
              📏 Perimeter: {gordStats.perimeterLength}px | 📐 Area: ~{gordStats.enclosedArea}px²
            </InfoText>
            <InfoText>
              ⚔️ Efficiency: {gordStats.defenseEfficiency} | 📦 Compact: {gordStats.compactness}
            </InfoText>
            <InfoText>
              🛡️ Protection: {(gordStats.protectionScore * 100).toFixed(1)}% | 🪵 Cost: {gordStats.woodCost}
            </InfoText>
          </>
        ) : (
          <InfoText>No gord planned. Place hubs first.</InfoText>
        )}
        <SectionTitle>Visualization</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={showPlannedGord} onChange={(e) => setShowPlannedGord(e.target.checked)} />{' '}
          Show Planned Gord
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showTerritoryGrid} onChange={(e) => setShowTerritoryGrid(e.target.checked)} />{' '}
          Show Territory
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showNavGrid} onChange={(e) => setShowNavGrid(e.target.checked)} /> Show Nav
          Grid
        </CheckboxLabel>
        <SectionTitle>Actions</SectionTitle>
        <Button onClick={autoPlaceSingleBuilding} style={{ backgroundColor: '#357', textAlign: 'center' }}>
          🎯 Auto-Place Single
        </Button>
        <Button onClick={clearBuildings} style={{ backgroundColor: '#a33', textAlign: 'center' }}>
          🗑️ Clear All
        </Button>
        <BackButton onClick={returnToIntro}>Back to Intro</BackButton>
      </Sidebar>
      <CanvasContainer>
        <Canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePos(null)}
        />
        <p style={{ marginTop: '20px', color: '#888', maxWidth: '600px', textAlign: 'center' }}>
          <strong>How to test:</strong> Place hubs (Bonfire/Storage) -&gt; Plan Gord -&gt; Execute Plan.
          <br />
          Multiple hub clusters will create separate gords. Holes are filtered out.
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

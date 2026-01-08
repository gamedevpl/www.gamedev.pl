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
import { calculateWrappedDistance, calculateWrappedDistanceSq, getDirectionVectorOnTorus } from '../game/utils/math-utils';
import { NAV_GRID_RESOLUTION, getNavigationGridCoords } from '../game/utils/navigation-utils';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState } from '../game/world-types';
import { paintTerrainOwnership } from '../game/entities/tribe/territory-utils';
import { renderAllTerritories } from '../game/render/render-territory';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../game/entities/tribe/territory-consts';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../game/utils/building-placement-utils';

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
      case 'Excellent': return '#2a5';
      case 'Good': return '#28a';
      case 'Fair': return '#a82';
      case 'Poor': return '#a33';
    }
  }};
`;

const ComparisonBox = styled.div`
  background-color: #333;
  border-radius: 4px;
  padding: 10px;
  margin: 10px 0;
  border-left: 3px solid #666;
`;

const ComparisonTitle = styled.div`
  font-size: 0.8rem;
  color: #aaa;
  margin-bottom: 5px;
  font-weight: bold;
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
  // Quality metrics
  defenseEfficiency: number; // Area per palisade (higher = more efficient)
  compactness: number; // How close to a square (1.0 = perfect square)
  accessibilityScore: number; // Gate ratio (gates / total perimeter pieces)
  woodCost: number; // Estimated wood needed
  qualityRating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

// AI default values (from tribe-building-task-producer.ts)
const AI_DEFAULT_MARGIN = 12;
const AI_DEFAULT_GATE_SPACING = 20;

// Default margin for gord perimeter (in grid cells)
const DEFAULT_GORD_MARGIN = 6;

// Quality scoring thresholds for gord evaluation
// Defense efficiency: area protected per palisade (higher = more efficient)
const DEFENSE_EFFICIENCY_EXCELLENT = 800; // Outstanding resource usage
const DEFENSE_EFFICIENCY_GOOD = 500; // Good balance of protection and resources
const DEFENSE_EFFICIENCY_FAIR = 300; // Acceptable but could be improved

// Compactness: how square the enclosure is (1.0 = perfect square)
// Square shapes are best for defense as they minimize perimeter for a given area
const COMPACTNESS_EXCELLENT = 0.7; // Near-square
const COMPACTNESS_GOOD = 0.5; // Reasonably compact
const COMPACTNESS_FAIR = 0.3; // Elongated but acceptable

// Accessibility: ratio of gates to total perimeter segments
// Too few gates = hard to exit/enter, too many = weak defense
const ACCESSIBILITY_MIN_OPTIMAL = 0.05; // At least 5% gates
const ACCESSIBILITY_MAX_OPTIMAL = 0.15; // No more than 15% gates
const ACCESSIBILITY_MIN_ACCEPTABLE = 0.02;
const ACCESSIBILITY_MAX_ACCEPTABLE = 0.25;

// Overall quality thresholds
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
    berryBush: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexedWorldState['search']['berryBush'],
    tree: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexedWorldState['search']['tree'],
    corpse: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['corpse'],
    prey: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['prey'],
    predator: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['predator'],
    tasks: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['tasks'],
  };

  // Add cache for getTribeCenter to work
  (state as unknown as IndexedWorldState).cache = {
    tribeCenters: {},
  } as unknown as IndexedWorldState['cache'];

  return state;
};

/**
 * Clusters hub buildings (bonfires and storage spots) that are close together.
 * This mirrors the AI's clusterHubs function.
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
 * Plans a gord (palisade enclosure) around a cluster of hub buildings.
 * This adapts the AI's planGords function for use in the test screen.
 */
function planGordPerimeter(
  cluster: BuildingEntity[],
  existingBuildings: BuildingEntity[],
  margin: number,
  gateSpacing: number,
): PlannedGordPosition[] {
  if (cluster.length === 0) return [];

  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const gridWidth = Math.ceil(width / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / NAV_GRID_RESOLUTION);

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

  const startRelGX = minRelGX - margin;
  const endRelGX = maxRelGX + margin;
  const startRelGY = minRelGY - margin;
  const endRelGY = maxRelGY + margin;

  const perimeterPositions: PlannedGordPosition[] = [];
  const addPos = (rgx: number, rgy: number, index: number) => {
    const gx = (refCoords.x + rgx + gridWidth) % gridWidth;
    const gy = (refCoords.y + rgy + gridHeight) % gridHeight;
    const position = {
      x: gx * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      y: gy * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
    };

    // Check if position already has a building
    const hasBuilding = existingBuildings.some(
      (b) => calculateWrappedDistanceSq(position, b.position, width, height) < 5 * 5,
    );

    if (!hasBuilding) {
      // Place gates at regular intervals (every gateSpacing positions, 2 segments wide)
      const isGate = index % gateSpacing === 0 || index % gateSpacing === 1;
      perimeterPositions.push({ position, isGate });
    }
  };

  // Generate perimeter in a continuous clockwise sequence
  let index = 0;
  // 1. Top edge: Left to Right
  for (let rgx = startRelGX; rgx <= endRelGX; rgx++) {
    addPos(rgx, startRelGY, index++);
  }
  // 2. Right edge: Top+1 to Bottom
  for (let rgy = startRelGY + 1; rgy <= endRelGY; rgy++) {
    addPos(endRelGX, rgy, index++);
  }
  // 3. Bottom edge: Right-1 to Left
  for (let rgx = endRelGX - 1; rgx >= startRelGX; rgx--) {
    addPos(rgx, endRelGY, index++);
  }
  // 4. Left edge: Bottom-1 to Top+1
  for (let rgy = endRelGY - 1; rgy > startRelGY; rgy--) {
    addPos(startRelGX, rgy, index++);
  }

  // Find the point closest to the cluster center to start the sequence (ideal gate location)
  if (perimeterPositions.length > 0) {
    const clusterCenter = {
      x: cluster.reduce((sum, h) => sum + h.position.x, 0) / cluster.length,
      y: cluster.reduce((sum, h) => sum + h.position.y, 0) / cluster.length,
    };
    let bestIdx = 0;
    let minDistSq = Infinity;
    for (let i = 0; i < perimeterPositions.length; i++) {
      const dSq = calculateWrappedDistanceSq(perimeterPositions[i].position, clusterCenter, width, height);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestIdx = i;
      }
    }

    // Rotate the sequence so it starts at the best point (closest to center = main gate)
    const rotated = [...perimeterPositions.slice(bestIdx), ...perimeterPositions.slice(0, bestIdx)];
    
    // Re-assign gate positions based on the rotated sequence
    return rotated.map((pos, i) => ({
      ...pos,
      isGate: i % gateSpacing === 0 || i % gateSpacing === 1,
    }));
  }

  return perimeterPositions;
}

/**
 * Calculates statistics and quality metrics for a planned gord.
 */
function calculateGordStats(
  plannedPositions: PlannedGordPosition[],
  hubs: BuildingEntity[],
  margin: number,
): GordPlanStats {
  const palisadeCount = plannedPositions.filter((p) => !p.isGate).length;
  const gateCount = plannedPositions.filter((p) => p.isGate).length;
  const totalSegments = plannedPositions.length;
  const perimeterLength = totalSegments * NAV_GRID_RESOLUTION;
  
  // Calculate actual enclosed area based on rectangular perimeter
  // The gord is rectangular, so we calculate from hub bounding box plus margin
  // Find the bounding box of all hubs
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const hub of hubs) {
    minX = Math.min(minX, hub.position.x);
    maxX = Math.max(maxX, hub.position.x);
    minY = Math.min(minY, hub.position.y);
    maxY = Math.max(maxY, hub.position.y);
  }
  const hubSpreadX = hubs.length > 0 ? maxX - minX : 0;
  const hubSpreadY = hubs.length > 0 ? maxY - minY : 0;
  const widthPx = hubSpreadX + (margin * 2 * NAV_GRID_RESOLUTION);
  const heightPx = hubSpreadY + (margin * 2 * NAV_GRID_RESOLUTION);
  const enclosedArea = widthPx * heightPx;

  // Quality metrics
  
  // 1. Defense Efficiency: Area protected per palisade (higher = more efficient use of resources)
  // Normalized to 0-100 scale where 100 is excellent
  const defenseEfficiency = palisadeCount > 0 ? enclosedArea / palisadeCount : 0;
  
  // 2. Compactness: How close to a square shape (1.0 = perfect square, lower = elongated)
  // For a rectangle, compactness = 4*area / perimeter² (maximum 1 for a square)
  const compactness = perimeterLength > 0 
    ? (4 * enclosedArea) / (perimeterLength * perimeterLength) 
    : 0;
  
  // 3. Accessibility Score: Ratio of gates to total perimeter (0-1, reasonable is 0.05-0.15)
  const accessibilityScore = totalSegments > 0 ? gateCount / totalSegments : 0;
  
  // 4. Wood Cost: Using actual building definitions
  const palisadeWoodCost = BUILDING_DEFINITIONS[BuildingType.Palisade].cost?.wood ?? 1;
  const gateWoodCost = BUILDING_DEFINITIONS[BuildingType.Gate].cost?.wood ?? 3;
  const woodCost = (palisadeCount * palisadeWoodCost) + (gateCount * gateWoodCost);
  
  // 5. Overall Quality Rating based on multiple factors
  // Score considers: defense efficiency, compactness, and reasonable gate ratio
  let qualityScore = 0;
  
  // Defense efficiency contribution (higher is better, normalized)
  if (defenseEfficiency > DEFENSE_EFFICIENCY_EXCELLENT) qualityScore += 30;
  else if (defenseEfficiency > DEFENSE_EFFICIENCY_GOOD) qualityScore += 20;
  else if (defenseEfficiency > DEFENSE_EFFICIENCY_FAIR) qualityScore += 10;
  
  // Compactness contribution (closer to square is better for defense)
  if (compactness > COMPACTNESS_EXCELLENT) qualityScore += 30;
  else if (compactness > COMPACTNESS_GOOD) qualityScore += 20;
  else if (compactness > COMPACTNESS_FAIR) qualityScore += 10;
  
  // Accessibility contribution (need some gates, but not too many)
  if (accessibilityScore >= ACCESSIBILITY_MIN_OPTIMAL && accessibilityScore <= ACCESSIBILITY_MAX_OPTIMAL) qualityScore += 25;
  else if (accessibilityScore > ACCESSIBILITY_MIN_ACCEPTABLE && accessibilityScore < ACCESSIBILITY_MAX_ACCEPTABLE) qualityScore += 15;
  else qualityScore += 5;
  
  // Hub protection bonus (more hubs enclosed = better)
  if (hubs.length >= 2) qualityScore += 15;
  else if (hubs.length === 1) qualityScore += 10;
  
  let qualityRating: GordPlanStats['qualityRating'];
  if (qualityScore >= QUALITY_EXCELLENT_THRESHOLD) qualityRating = 'Excellent';
  else if (qualityScore >= QUALITY_GOOD_THRESHOLD) qualityRating = 'Good';
  else if (qualityScore >= QUALITY_FAIR_THRESHOLD) qualityRating = 'Fair';
  else qualityRating = 'Poor';

  return {
    perimeterLength,
    palisadeCount,
    gateCount,
    hubCount: hubs.length,
    enclosedArea,
    defenseEfficiency: Math.round(defenseEfficiency),
    compactness: Math.round(compactness * 100) / 100,
    accessibilityScore: Math.round(accessibilityScore * 1000) / 1000,
    woodCost,
    qualityRating,
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
  const [showValidPlacement, setShowValidPlacement] = useState(true);
  const [showPlannedGord, setShowPlannedGord] = useState(true);
  const [gordMargin, setGordMargin] = useState(DEFAULT_GORD_MARGIN);
  const [gateSpacing, setGateSpacing] = useState(20);
  const [plannedGordPositions, setPlannedGordPositions] = useState<PlannedGordPosition[]>([]);

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  // Get hub buildings (bonfires and storage spots)
  const hubBuildings = useMemo(() => {
    return placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
    );
  }, [placedBuildings]);

  // Calculate gord statistics
  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedGordPositions.length === 0) return null;
    return calculateGordStats(plannedGordPositions, hubBuildings, gordMargin);
  }, [plannedGordPositions, hubBuildings, gordMargin]);

  // Calculate what the AI would build with its default settings
  const aiDefaultStats = useMemo((): GordPlanStats | null => {
    if (hubBuildings.length === 0) return null;
    
    // Plan gord with AI default settings
    const clusters = clusterHubs(hubBuildings, CANVAS_WIDTH, CANVAS_HEIGHT);
    const allPositions: PlannedGordPosition[] = [];
    for (const cluster of clusters) {
      const positions = planGordPerimeter(cluster, placedBuildings, AI_DEFAULT_MARGIN, AI_DEFAULT_GATE_SPACING);
      allPositions.push(...positions);
    }
    
    if (allPositions.length === 0) return null;
    return calculateGordStats(allPositions, hubBuildings, AI_DEFAULT_MARGIN);
  }, [hubBuildings, placedBuildings]);

  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    const gridSize = NAV_GRID_RESOLUTION;
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    };
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

      // Check if placement is valid
      if (!canPlaceBuilding(snappedPos, selectedType, 1, mockState)) {
        return;
      }

      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, 1);

      // Update territory
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
    setTerrainOwnership(
      new Array(
        Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
          Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
      ).fill(null),
    );
  }, []);

  // Plan a gord around all hub buildings
  const planGord = useCallback(() => {
    const hubs = placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
    );

    if (hubs.length === 0) {
      setPlannedGordPositions([]);
      return;
    }

    // Cluster the hubs
    const clusters = clusterHubs(hubs, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Plan perimeter for all clusters
    const allPositions: PlannedGordPosition[] = [];
    for (const cluster of clusters) {
      const positions = planGordPerimeter(cluster, placedBuildings, gordMargin, gateSpacing);
      allPositions.push(...positions);
    }

    setPlannedGordPositions(allPositions);
  }, [placedBuildings, gordMargin, gateSpacing]);

  // Execute the planned gord - place all palisades and gates
  const executeGordPlan = useCallback(() => {
    if (plannedGordPositions.length === 0) return;

    const newBuildings: BuildingEntity[] = [];
    let currentId = nextBuildingId;
    const tempOwnership = [...terrainOwnership];
    const tempState = {
      mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      terrainOwnership: tempOwnership,
    } as GameWorldState;

    for (const planned of plannedGordPositions) {
      const buildingType = planned.isGate ? BuildingType.Gate : BuildingType.Palisade;
      const newBuilding = createBuildingEntity(currentId++, buildingType, planned.position, 1);
      newBuildings.push(newBuilding);
      paintTerrainOwnership(planned.position, TERRITORY_BUILDING_RADIUS, 1, tempState);
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
    setPlannedGordPositions([]);
  }, [plannedGordPositions, nextBuildingId, terrainOwnership]);

  // Auto-place a single building using the existing algorithm
  const autoPlaceSingleBuilding = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership);
    const humanPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

    const position = findAdjacentBuildingPlacement(
      selectedType,
      1,
      mockState,
      200, // searchRadius
      100, // minDistanceFromOtherTribes
      humanPos,
    );

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

      // Background
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Territory visualization
      if (showTerritoryGrid) {
        renderAllTerritories(ctx, mockState, viewportCenter, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, 1);
      }

      // Navigation grid
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

      // Buildings
      for (const building of placedBuildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      // Render planned gord positions
      if (showPlannedGord && plannedGordPositions.length > 0) {
        ctx.save();
        for (let i = 0; i < plannedGordPositions.length; i++) {
          const planned = plannedGordPositions[i];
          const { x, y } = planned.position;
          const size = NAV_GRID_RESOLUTION;

          // Draw filled rectangle for planned position
          if (planned.isGate) {
            // Gates are blue
            ctx.fillStyle = 'rgba(100, 150, 255, 0.7)';
            ctx.strokeStyle = '#4080FF';
          } else {
            // Palisades are brown
            ctx.fillStyle = 'rgba(180, 120, 60, 0.7)';
            ctx.strokeStyle = '#8B4513';
          }

          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.lineWidth = 2;
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);

          // Draw sequence number for first few positions to show order
          if (i < 5 || i === plannedGordPositions.length - 1) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), x, y);
          }
        }

        // Draw connecting lines to show the perimeter path
        if (plannedGordPositions.length > 1) {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plannedGordPositions[0].position.x, plannedGordPositions[0].position.y);
          for (let i = 1; i < plannedGordPositions.length; i++) {
            ctx.lineTo(plannedGordPositions[i].position.x, plannedGordPositions[i].position.y);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Ghost building at mouse position
      if (mousePos) {
        const canPlace = canPlaceBuilding(mousePos, selectedType, 1, mockState);
        const isValid = showValidPlacement ? canPlace : true;

        renderGhostBuilding(ctx, mousePos, selectedType, isValid, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        });

        // Show placement validation info
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
  }, [placedBuildings, mousePos, selectedType, terrainOwnership, showTerritoryGrid, showNavGrid, showValidPlacement, showPlannedGord, plannedGordPositions]);

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
        <InfoText style={{ marginBottom: '10px' }}>
          Margin (grid cells): {gordMargin}
        </InfoText>
        <input
          type="range"
          min="3"
          max="20"
          value={gordMargin}
          onChange={(e) => setGordMargin(Number(e.target.value))}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <InfoText style={{ marginBottom: '10px' }}>
          Gate spacing: every {gateSpacing} segments
        </InfoText>
        <input
          type="range"
          min="5"
          max="40"
          value={gateSpacing}
          onChange={(e) => setGateSpacing(Number(e.target.value))}
          style={{ width: '100%', marginBottom: '10px' }}
        />
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
            <InfoText>🏠 Hubs enclosed: {gordStats.hubCount}</InfoText>
            <InfoText>🧱 Palisades: {gordStats.palisadeCount}</InfoText>
            <InfoText>🚪 Gates: {gordStats.gateCount}</InfoText>
            <InfoText>📏 Perimeter: {gordStats.perimeterLength}px</InfoText>
            <InfoText>📐 Area: ~{gordStats.enclosedArea}px²</InfoText>
            <InfoText>⚔️ Defense efficiency: {gordStats.defenseEfficiency} area/palisade</InfoText>
            <InfoText>📦 Compactness: {gordStats.compactness} (1.0 = perfect)</InfoText>
            <InfoText>🚪 Accessibility: {(gordStats.accessibilityScore * 100).toFixed(1)}%</InfoText>
            <InfoText>🪵 Wood cost: ~{gordStats.woodCost}</InfoText>
          </>
        ) : (
          <InfoText>No gord planned. Place hubs first.</InfoText>
        )}

        {aiDefaultStats && (
          <ComparisonBox>
            <ComparisonTitle>AI Default (margin={AI_DEFAULT_MARGIN})</ComparisonTitle>
            <InfoText>
              🎯 <QualityBadge $rating={aiDefaultStats.qualityRating}>{aiDefaultStats.qualityRating}</QualityBadge>
            </InfoText>
            <InfoText>🧱 {aiDefaultStats.palisadeCount} palisades, 🚪 {aiDefaultStats.gateCount} gates</InfoText>
            <InfoText>⚔️ Efficiency: {aiDefaultStats.defenseEfficiency} | 📦 Compact: {aiDefaultStats.compactness}</InfoText>
            <InfoText>🪵 Wood: ~{aiDefaultStats.woodCost}</InfoText>
          </ComparisonBox>
        )}

        <SectionTitle>Visualization</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={showPlannedGord} onChange={(e) => setShowPlannedGord(e.target.checked)} />
          Show Planned Gord
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showTerritoryGrid} onChange={(e) => setShowTerritoryGrid(e.target.checked)} />
          Show Territory
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showNavGrid} onChange={(e) => setShowNavGrid(e.target.checked)} />
          Show Navigation Grid
        </CheckboxLabel>
        <CheckboxLabel>
          <input
            type="checkbox"
            checked={showValidPlacement}
            onChange={(e) => setShowValidPlacement(e.target.checked)}
          />
          Show Valid Placement
        </CheckboxLabel>

        <SectionTitle>Info</SectionTitle>
        <InfoText>Buildings placed: {placedBuildings.length}</InfoText>
        <InfoText>Grid size: {NAV_GRID_RESOLUTION}px</InfoText>

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
          style={{ cursor: 'crosshair' }}
        />
        <p style={{ marginTop: '20px', color: '#888', maxWidth: '600px', textAlign: 'center' }}>
          <strong>How to test AI Gord building:</strong><br />
          1. Place hub buildings (Bonfires/Storage) where you want the center of your settlement<br />
          2. Click "Plan Gord" to see how the AI would build a defensive enclosure<br />
          3. Adjust margin/gate spacing and re-plan to compare different configurations<br />
          4. Click "Execute Plan" to place all palisades and gates
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

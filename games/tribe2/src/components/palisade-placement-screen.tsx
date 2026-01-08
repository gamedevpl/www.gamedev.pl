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
}

// Default margin for gord perimeter (in grid cells)
const DEFAULT_GORD_MARGIN = 6;

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
 * Calculates statistics for a planned gord.
 */
function calculateGordStats(
  plannedPositions: PlannedGordPosition[],
  hubs: BuildingEntity[],
): GordPlanStats {
  const palisadeCount = plannedPositions.filter((p) => !p.isGate).length;
  const gateCount = plannedPositions.filter((p) => p.isGate).length;
  const perimeterLength = plannedPositions.length * NAV_GRID_RESOLUTION;
  
  // Calculate enclosed area (rough approximation based on perimeter)
  // Using the formula: Area ≈ (perimeter²) / (4π) for a circle
  // This is a rough estimate; actual area depends on shape
  const enclosedArea = Math.round((perimeterLength * perimeterLength) / (4 * Math.PI));

  return {
    perimeterLength,
    palisadeCount,
    gateCount,
    hubCount: hubs.length,
    enclosedArea,
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
    return calculateGordStats(plannedGordPositions, hubBuildings);
  }, [plannedGordPositions, hubBuildings]);

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
            <InfoText>🏠 Hubs enclosed: {gordStats.hubCount}</InfoText>
            <InfoText>🧱 Palisades planned: {gordStats.palisadeCount}</InfoText>
            <InfoText>🚪 Gates planned: {gordStats.gateCount}</InfoText>
            <InfoText>📏 Perimeter: {gordStats.perimeterLength}px</InfoText>
            <InfoText>📐 Est. area: ~{gordStats.enclosedArea}px²</InfoText>
          </>
        ) : (
          <InfoText>No gord planned. Place hubs first.</InfoText>
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

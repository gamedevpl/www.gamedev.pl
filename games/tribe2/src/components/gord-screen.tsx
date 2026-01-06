import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../game/entities/buildings/building-consts';
import { renderBuilding } from '../game/render/render-building';
import { renderTree } from '../game/render/render-tree';
import { TreeEntity } from '../game/entities/plants/tree/tree-types';
import { TREE_RADIUS } from '../game/entities/plants/tree/tree-consts';
import { TREE_FULL } from '../game/entities/plants/tree/states/tree-state-types';
import { IndexedWorldState } from '../game/world-index/world-index-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';
import {
  calculateWrappedDistance,
  calculateWrappedDistanceSq,
  getDirectionVectorOnTorus,
} from '../game/utils/math-utils';
import { NAV_GRID_RESOLUTION, getNavigationGridCoords } from '../game/utils/navigation-utils';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState } from '../game/world-types';

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

const SliderContainer = styled.div`
  margin-bottom: 15px;
`;

const SliderLabel = styled.label`
  display: block;
  margin-bottom: 5px;
  font-size: 0.9rem;
`;

const Slider = styled.input`
  width: 100%;
`;

const InfoText = styled.p`
  font-size: 0.9rem;
  color: #888;
  margin: 5px 0;
`;

const TribeSelector = styled.div`
  display: flex;
  gap: 5px;
  margin-bottom: 10px;
`;

const TribeButton = styled.button<{ $color: string; $selected: boolean }>`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid ${(props) => (props.$selected ? '#fff' : 'transparent')};
  background-color: ${(props) => props.$color};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.1);
  }
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Tribe colors for multi-tribe support
const TRIBE_COLORS = [
  { id: 1, color: '#4CAF50', name: 'Green Tribe' },
  { id: 2, color: '#F44336', name: 'Red Tribe' },
  { id: 3, color: '#2196F3', name: 'Blue Tribe' },
  { id: 4, color: '#FF9800', name: 'Orange Tribe' },
];

type HubType = 'bonfire' | 'storage';
type PlacementMode = 'bonfire' | 'storage' | 'tree';

interface Hub {
  id: number;
  type: HubType;
  position: Vector2D;
  tribeId: number;
}

interface PlacedTree {
  id: number;
  entity: TreeEntity;
}

const createMockWorldState = (buildings: BuildingEntity[], trees: TreeEntity[]): GameWorldState => {
  const entitiesMap: Record<number, unknown> = buildings.reduce(
    (acc, b) => {
      acc[b.id] = b;
      return acc;
    },
    {} as Record<number, unknown>,
  );

  // Add trees to entities
  for (const tree of trees) {
    entitiesMap[tree.id] = tree;
  }

  // Mock tribe leaders
  for (const tribe of TRIBE_COLORS) {
    entitiesMap[tribe.id] = {
      id: tribe.id,
      type: 'human',
      leaderId: tribe.id,
      isPlayer: tribe.id === 1,
      tribeInfo: { tribeBadge: tribe.id === 1 ? '👑' : '⚔️', tribeColor: tribe.color },
      position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      radius: 10,
      isAdult: true,
      gender: 'male',
      age: 25,
    };
  }

  const state = {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: { entities: entitiesMap },
    notifications: [],
    visualEffects: [],
    tutorialState: { isActive: false, highlightedEntityIds: [], activeUIHighlights: [] },
    plantingZoneConnections: {},
    terrainOwnership: [],
  } as unknown as GameWorldState;

  // Add search functionality (mocking IndexedWorldState)
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
      all: () => TRIBE_COLORS.map((t) => entitiesMap[t.id]),
      byProperty: () => [],
      byRadius: () => [],
      byRect: () => [],
    } as unknown as IndexedWorldState['search']['human'],
    berryBush: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['berryBush'],
    tree: {
      byRect: () => trees,
      all: () => trees,
      byRadius: (pos: Vector2D, radius: number) =>
        trees.filter((t) => calculateWrappedDistance(pos, t.position, CANVAS_WIDTH, CANVAS_HEIGHT) <= radius),
    } as unknown as IndexedWorldState['search']['tree'],
    corpse: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['corpse'],
    prey: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['prey'],
    predator: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['predator'],
    tasks: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['tasks'],
  };

  return state;
};

const createTreeEntity = (id: number, position: Vector2D): TreeEntity => {
  return {
    id,
    type: 'tree',
    position,
    radius: TREE_RADIUS,
    age: 120, // Mature tree
    lifespan: 24 * 30 * 10, // 300 days
    swayOffset: Math.random() * Math.PI * 2,
    variant: Math.floor(Math.random() * 4),
    timeSinceLastSpreadAttempt: 0,
    spreadRadius: 60,
    wood: [],
    woodGenerated: false,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    stateMachine: [TREE_FULL, { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
  } as TreeEntity;
};

const createBuildingEntity = (
  id: number,
  buildingType: BuildingType,
  position: { x: number; y: number },
  ownerId: number | undefined,
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

// Calculate gord perimeter positions based on hubs
function calculateGordPerimeter(
  hubs: Hub[],
  margin: number,
  width: number,
  height: number,
): { perimeterPositions: Vector2D[]; boundingBox: { minX: number; maxX: number; minY: number; maxY: number } } {
  if (hubs.length === 0) {
    return { perimeterPositions: [], boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  const gridWidth = Math.ceil(width / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / NAV_GRID_RESOLUTION);

  const ref = hubs[0].position;
  const refCoords = getNavigationGridCoords(ref, width, height);

  let minRelGX = 0,
    maxRelGX = 0,
    minRelGY = 0,
    maxRelGY = 0;

  for (const hub of hubs) {
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

  const perimeterPositions: Vector2D[] = [];
  const addPos = (rgx: number, rgy: number) => {
    const gx = (refCoords.x + rgx + gridWidth) % gridWidth;
    const gy = (refCoords.y + rgy + gridHeight) % gridHeight;
    perimeterPositions.push({
      x: gx * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      y: gy * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
    });
  };

  // Top and bottom edges
  for (let rgx = startRelGX; rgx <= endRelGX; rgx++) {
    addPos(rgx, startRelGY);
    addPos(rgx, endRelGY);
  }
  // Left and right edges (excluding corners)
  for (let rgy = startRelGY + 1; rgy < endRelGY; rgy++) {
    addPos(startRelGX, rgy);
    addPos(endRelGX, rgy);
  }

  // Calculate bounding box in world coordinates
  const boundingBox = {
    minX: ((refCoords.x + startRelGX) * NAV_GRID_RESOLUTION + width) % width,
    maxX: ((refCoords.x + endRelGX + 1) * NAV_GRID_RESOLUTION + width) % width,
    minY: ((refCoords.y + startRelGY) * NAV_GRID_RESOLUTION + height) % height,
    maxY: ((refCoords.y + endRelGY + 1) * NAV_GRID_RESOLUTION + height) % height,
  };

  return { perimeterPositions, boundingBox };
}

export const GordScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [hubs, setHubs] = useState<Hub[]>([
    { id: 1, type: 'bonfire', position: { x: 400, y: 300 }, tribeId: 1 },
  ]);
  const [placedTrees, setPlacedTrees] = useState<PlacedTree[]>([]);
  const [margin, setMargin] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  const [showPerimeter, setShowPerimeter] = useState(true);
  const [showGatePositions, setShowGatePositions] = useState(true);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('bonfire');
  const [selectedTribeId, setSelectedTribeId] = useState(1);
  const [nextHubId, setNextHubId] = useState(2);
  const [nextTreeId, setNextTreeId] = useState(1000);
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [time, setTime] = useState(0);

  const snapToGrid = useCallback((x: number, y: number): Vector2D => {
    const gridSize = NAV_GRID_RESOLUTION;
    return {
      x: Math.round(x / gridSize) * gridSize + gridSize / 2,
      y: Math.round(y / gridSize) * gridSize + gridSize / 2,
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

      const isOccupiedByHub = hubs.some(
        (h) => Math.abs(h.position.x - snappedPos.x) < 30 && Math.abs(h.position.y - snappedPos.y) < 30,
      );
      const isOccupiedByTree = placedTrees.some(
        (t) => Math.abs(t.entity.position.x - snappedPos.x) < 25 && Math.abs(t.entity.position.y - snappedPos.y) < 25,
      );

      if (placementMode === 'tree') {
        if (!isOccupiedByHub && !isOccupiedByTree) {
          const newTree = createTreeEntity(nextTreeId, snappedPos);
          setPlacedTrees((prev) => [...prev, { id: nextTreeId, entity: newTree }]);
          setNextTreeId((prev) => prev + 1);
        }
      } else if (!isOccupiedByHub && !isOccupiedByTree) {
        setHubs((prev) => [...prev, { id: nextHubId, type: placementMode, position: snappedPos, tribeId: selectedTribeId }]);
        setNextHubId((prev) => prev + 1);
      }
    },
    [placementMode, snapToGrid, hubs, placedTrees, nextHubId, nextTreeId, selectedTribeId],
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

  const clearAll = useCallback(() => {
    setHubs([]);
    setPlacedTrees([]);
    setNextHubId(1);
    setNextTreeId(1000);
  }, []);

  // Update time for tree sway animation
  useEffect(() => {
    const interval = setInterval(() => {
      setTime((t) => t + 16);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // Convert hubs to building entities for rendering
  const buildings = hubs.map((hub) =>
    createBuildingEntity(
      hub.id,
      hub.type === 'bonfire' ? BuildingType.Bonfire : BuildingType.StorageSpot,
      hub.position,
      hub.tribeId,
    ),
  );

  // Get tree entities
  const treeEntities = placedTrees.map((t) => t.entity);

  // Group hubs by tribe for perimeter calculation
  const hubsByTribe = TRIBE_COLORS.reduce(
    (acc, tribe) => {
      acc[tribe.id] = hubs.filter((h) => h.tribeId === tribe.id);
      return acc;
    },
    {} as Record<number, Hub[]>,
  );

  // Calculate perimeters for each tribe
  const tribePerimeters = TRIBE_COLORS.map((tribe) => {
    const tribeHubs = hubsByTribe[tribe.id] || [];
    if (tribeHubs.length === 0) {
      return { tribeId: tribe.id, color: tribe.color, perimeterPositions: [], gateIndices: new Set<number>(), center: null };
    }

    const { perimeterPositions } = calculateGordPerimeter(tribeHubs, margin, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Calculate tribe center
    const center = {
      x: tribeHubs.reduce((sum, h) => sum + h.position.x, 0) / tribeHubs.length,
      y: tribeHubs.reduce((sum, h) => sum + h.position.y, 0) / tribeHubs.length,
    };

    // Sort perimeter by distance to center for gate placement
    const sortedPerimeter = [...perimeterPositions].sort((a, b) => {
      const distA = calculateWrappedDistanceSq(a, center, CANVAS_WIDTH, CANVAS_HEIGHT);
      const distB = calculateWrappedDistanceSq(b, center, CANVAS_WIDTH, CANVAS_HEIGHT);
      return distA - distB;
    });

    // Determine gate positions
    const GATE_SPACING_SEGMENTS = 15;
    const gateIndices = new Set<number>();
    let segmentsSinceGate = 0;
    for (let i = 0; i < sortedPerimeter.length; i++) {
      if (segmentsSinceGate === 0 || segmentsSinceGate >= GATE_SPACING_SEGMENTS) {
        gateIndices.add(i);
        segmentsSinceGate = 1;
      } else {
        segmentsSinceGate++;
      }
    }

    return { tribeId: tribe.id, color: tribe.color, perimeterPositions: sortedPerimeter, gateIndices, center };
  });

  // Count stats
  const totalPerimeterCells = tribePerimeters.reduce((sum, t) => sum + t.perimeterPositions.length, 0);
  const totalGates = tribePerimeters.reduce((sum, t) => sum + t.gateIndices.size, 0);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const mockState = createMockWorldState(buildings, treeEntities);

      // 1. Background
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. Grid lines
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
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

      // 3. Draw perimeter positions for each tribe
      if (showPerimeter) {
        for (const tribePerimeter of tribePerimeters) {
          const { perimeterPositions, gateIndices, color } = tribePerimeter;

          for (let i = 0; i < perimeterPositions.length; i++) {
            const pos = perimeterPositions[i];
            const isGate = gateIndices.has(i) && showGatePositions;

            if (isGate) {
              // Gate position (lighter version of tribe color)
              ctx.fillStyle = color + '80'; // 50% opacity
              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.fillRect(
                pos.x - NAV_GRID_RESOLUTION / 2,
                pos.y - NAV_GRID_RESOLUTION / 2,
                NAV_GRID_RESOLUTION,
                NAV_GRID_RESOLUTION,
              );
              ctx.strokeRect(
                pos.x - NAV_GRID_RESOLUTION / 2,
                pos.y - NAV_GRID_RESOLUTION / 2,
                NAV_GRID_RESOLUTION,
                NAV_GRID_RESOLUTION,
              );
            } else {
              // Palisade position (tribe color with opacity)
              ctx.fillStyle = color + '99'; // 60% opacity
              ctx.fillRect(
                pos.x - NAV_GRID_RESOLUTION / 2,
                pos.y - NAV_GRID_RESOLUTION / 2,
                NAV_GRID_RESOLUTION,
                NAV_GRID_RESOLUTION,
              );
            }
          }
        }
      }

      // 4. Draw tribe centers
      for (const tribePerimeter of tribePerimeters) {
        if (tribePerimeter.center) {
          ctx.fillStyle = tribePerimeter.color;
          ctx.beginPath();
          ctx.arc(tribePerimeter.center.x, tribePerimeter.center.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // 5. Trees
      for (const tree of treeEntities) {
        renderTree(ctx, tree, time);
      }

      // 6. Buildings (hubs)
      for (const building of buildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      // 7. Mouse cursor preview
      if (mousePos) {
        const selectedTribe = TRIBE_COLORS.find((t) => t.id === selectedTribeId);
        ctx.strokeStyle = placementMode === 'tree' ? '#76a331' : (selectedTribe?.color || '#fff');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 15, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [buildings, treeEntities, hubs, margin, showGrid, showPerimeter, showGatePositions, tribePerimeters, mousePos, selectedTribeId, placementMode, time]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Gord Placement Debug</Title>

        <SectionTitle>Select Tribe</SectionTitle>
        <TribeSelector>
          {TRIBE_COLORS.map((tribe) => (
            <TribeButton
              key={tribe.id}
              $color={tribe.color}
              $selected={selectedTribeId === tribe.id}
              onClick={() => setSelectedTribeId(tribe.id)}
              title={tribe.name}
            />
          ))}
        </TribeSelector>

        <SectionTitle>Placement Mode</SectionTitle>
        <Button
          onClick={() => setPlacementMode('bonfire')}
          style={{
            backgroundColor: placementMode === 'bonfire' ? '#666' : '#444',
            borderLeft: placementMode === 'bonfire' ? '3px solid #ff6600' : 'none',
          }}
        >
          🔥 Place Bonfire
        </Button>
        <Button
          onClick={() => setPlacementMode('storage')}
          style={{
            backgroundColor: placementMode === 'storage' ? '#666' : '#444',
            borderLeft: placementMode === 'storage' ? '3px solid #8B4513' : 'none',
          }}
        >
          📦 Place Storage
        </Button>
        <Button
          onClick={() => setPlacementMode('tree')}
          style={{
            backgroundColor: placementMode === 'tree' ? '#666' : '#444',
            borderLeft: placementMode === 'tree' ? '3px solid #76a331' : 'none',
          }}
        >
          🌲 Place Tree
        </Button>

        <SectionTitle>Gord Settings</SectionTitle>
        <SliderContainer>
          <SliderLabel>Margin: {margin} cells ({margin * NAV_GRID_RESOLUTION}px)</SliderLabel>
          <Slider
            type="range"
            min="5"
            max="40"
            value={margin}
            onChange={(e) => setMargin(parseInt(e.target.value))}
          />
        </SliderContainer>

        <SectionTitle>Display Options</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show Grid
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showPerimeter} onChange={(e) => setShowPerimeter(e.target.checked)} />
          Show Perimeter
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showGatePositions} onChange={(e) => setShowGatePositions(e.target.checked)} />
          Highlight Gate Positions
        </CheckboxLabel>

        <SectionTitle>Info</SectionTitle>
        <InfoText>Hubs placed: {hubs.length}</InfoText>
        <InfoText>Trees placed: {placedTrees.length}</InfoText>
        <InfoText>Total perimeter cells: {totalPerimeterCells}</InfoText>
        <InfoText>Total gates: {totalGates}</InfoText>
        <InfoText>Total palisades: {totalPerimeterCells - totalGates}</InfoText>

        <Button onClick={clearAll} style={{ backgroundColor: '#a33', marginTop: '20px', textAlign: 'center' }}>
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
        <p style={{ marginTop: '20px', color: '#888' }}>
          Click to place bonfires/storage/trees. Select a tribe to place hubs for that tribe.
        </p>
        <p style={{ color: '#666', fontSize: '0.8rem' }}>
          Perimeter colors match tribe colors | Lighter cells = Gate positions | Colored dots = Tribe centers
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

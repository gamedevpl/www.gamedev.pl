import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../game/entities/buildings/building-consts';
import { renderBuilding } from '../game/render/render-building';
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

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

type HubType = 'bonfire' | 'storage';

interface Hub {
  id: number;
  type: HubType;
  position: Vector2D;
}

const createMockWorldState = (buildings: BuildingEntity[]): GameWorldState => {
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
  };

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
      all: () => [entitiesMap[1]],
      byProperty: () => [],
      byRadius: () => [],
      byRect: () => [],
    } as unknown as IndexedWorldState['search']['human'],
    berryBush: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['berryBush'],
    tree: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexedWorldState['search']['tree'],
    corpse: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['corpse'],
    prey: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['prey'],
    predator: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['predator'],
    tasks: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['tasks'],
  };

  return state;
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
    { id: 1, type: 'bonfire', position: { x: 400, y: 300 } },
  ]);
  const [margin, setMargin] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  const [showPerimeter, setShowPerimeter] = useState(true);
  const [showGatePositions, setShowGatePositions] = useState(true);
  const [placementMode, setPlacementMode] = useState<'bonfire' | 'storage'>('bonfire');
  const [nextHubId, setNextHubId] = useState(2);
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);

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

      const isOccupied = hubs.some(
        (h) => Math.abs(h.position.x - snappedPos.x) < 30 && Math.abs(h.position.y - snappedPos.y) < 30,
      );

      if (!isOccupied) {
        setHubs((prev) => [...prev, { id: nextHubId, type: placementMode, position: snappedPos }]);
        setNextHubId((prev) => prev + 1);
      }
    },
    [placementMode, snapToGrid, hubs, nextHubId],
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
    setNextHubId(1);
  }, []);

  // Convert hubs to building entities for rendering
  const buildings = hubs.map((hub) =>
    createBuildingEntity(
      hub.id,
      hub.type === 'bonfire' ? BuildingType.Bonfire : BuildingType.StorageSpot,
      hub.position,
      1,
    ),
  );

  const { perimeterPositions, boundingBox } = calculateGordPerimeter(hubs, margin, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Sort perimeter by distance to center for gate placement visualization
  const tribeCenter =
    hubs.length > 0
      ? {
          x: hubs.reduce((sum, h) => sum + h.position.x, 0) / hubs.length,
          y: hubs.reduce((sum, h) => sum + h.position.y, 0) / hubs.length,
        }
      : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

  const sortedPerimeter = [...perimeterPositions].sort((a, b) => {
    const distA = calculateWrappedDistanceSq(a, tribeCenter, CANVAS_WIDTH, CANVAS_HEIGHT);
    const distB = calculateWrappedDistanceSq(b, tribeCenter, CANVAS_WIDTH, CANVAS_HEIGHT);
    return distA - distB;
  });

  // Determine gate positions - gates are placed at regular intervals along the perimeter
  const GATE_SPACING_SEGMENTS = 15; // Number of palisade segments between gates
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

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const mockState = createMockWorldState(buildings);

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

      // 3. Draw bounding box
      if (hubs.length > 0 && showPerimeter) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);

        // Draw simple rectangle representation (may not be accurate for wrapped coords)
        const boxWidth = Math.abs(boundingBox.maxX - boundingBox.minX);
        const boxHeight = Math.abs(boundingBox.maxY - boundingBox.minY);
        ctx.strokeRect(boundingBox.minX, boundingBox.minY, boxWidth, boxHeight);
        ctx.setLineDash([]);
      }

      // 4. Draw perimeter positions
      if (showPerimeter) {
        for (let i = 0; i < sortedPerimeter.length; i++) {
          const pos = sortedPerimeter[i];
          const isGate = gateIndices.has(i) && showGatePositions;

          if (isGate) {
            // Gate position (green)
            ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.fillRect(
              pos.x - NAV_GRID_RESOLUTION / 2,
              pos.y - NAV_GRID_RESOLUTION / 2,
              NAV_GRID_RESOLUTION,
              NAV_GRID_RESOLUTION,
            );
          } else {
            // Palisade position (orange)
            ctx.fillStyle = 'rgba(255, 165, 0, 0.6)';
            ctx.fillRect(
              pos.x - NAV_GRID_RESOLUTION / 2,
              pos.y - NAV_GRID_RESOLUTION / 2,
              NAV_GRID_RESOLUTION,
              NAV_GRID_RESOLUTION,
            );
          }
        }
      }

      // 5. Draw tribe center
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(tribeCenter.x, tribeCenter.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 6. Buildings (hubs)
      for (const building of buildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      // 7. Mouse cursor preview
      if (mousePos) {
        ctx.strokeStyle = '#fff';
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
  }, [buildings, hubs, margin, showGrid, showPerimeter, showGatePositions, sortedPerimeter, gateIndices, mousePos, tribeCenter, boundingBox]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Gord Placement Debug</Title>

        <SectionTitle>Place Hubs</SectionTitle>
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
        <InfoText>Perimeter cells: {perimeterPositions.length}</InfoText>
        <InfoText>Gates: {gateIndices.size}</InfoText>
        <InfoText>Palisades: {perimeterPositions.length - gateIndices.size}</InfoText>

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
          Click to place bonfires/storage spots. The gord perimeter is calculated automatically.
        </p>
        <p style={{ color: '#666', fontSize: '0.8rem' }}>
          Orange = Palisade positions | Green = Gate positions | Yellow dot = Tribe center
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

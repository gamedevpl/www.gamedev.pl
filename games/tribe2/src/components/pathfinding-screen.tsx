import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { HumanEntity } from '../game/entities/characters/human/human-types';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../game/entities/buildings/building-consts';
import { renderBuilding } from '../game/render/render-building';
import { renderTree } from '../game/render/render-tree';
import { TreeEntity } from '../game/entities/plants/tree/tree-types';
import { TREE_RADIUS } from '../game/entities/plants/tree/tree-consts';
import { TREE_FULL } from '../game/entities/plants/tree/states/tree-state-types';
import { IndexedWorldState } from '../game/world-index/world-index-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';
import { calculateWrappedDistance } from '../game/utils/math-utils';
import {
  NAV_GRID_RESOLUTION,
  initNavigationGrid,
  updateNavigationGridSector,
  findPath,
  isPathBlocked,
} from '../game/utils/navigation-utils';
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

const InfoText = styled.p`
  font-size: 0.9rem;
  color: #888;
  margin: 5px 0;
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

type PlacementMode = 'obstacle' | 'gate' | 'tree' | 'start' | 'end';

const createMockWorldState = (
  buildings: BuildingEntity[],
  trees: TreeEntity[],
  navigationGrid: ReturnType<typeof initNavigationGrid>,
): GameWorldState => {
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

  // Mock player leader
  entitiesMap[1] = {
    id: 1,
    type: 'human',
    leaderId: 1,
    isPlayer: true,
    tribeInfo: { tribeBadge: '👑', tribeColor: '#4CAF50' },
    position: { x: 0, y: 0 },
    radius: 10,
    isAdult: true,
    gender: 'male',
    age: 25,
  };

  const state = {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: { entities: entitiesMap },
    navigationGrid,
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
    } as unknown as IndexedWorldState['search']['building'],
    human: {
      all: () => [entitiesMap[1]],
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

export const PathfindingScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [placementMode, setPlacementMode] = useState<PlacementMode>('obstacle');
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [placedTrees, setPlacedTrees] = useState<TreeEntity[]>([]);
  const [startPos, setStartPos] = useState<Vector2D>({ x: 100, y: 300 });
  const [endPos, setEndPos] = useState<Vector2D>({ x: 700, y: 300 });
  const [path, setPath] = useState<Vector2D[] | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showObstacles, setShowObstacles] = useState(true);
  const [nextBuildingId, setNextBuildingId] = useState(10);
  const [nextTreeId, setNextTreeId] = useState(1000);
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [time, setTime] = useState(0);

  const [navigationGrid, setNavigationGrid] = useState(() => initNavigationGrid(CANVAS_WIDTH, CANVAS_HEIGHT));

  const snapToGrid = useCallback((x: number, y: number): Vector2D => {
    const gridSize = NAV_GRID_RESOLUTION;
    return {
      x: Math.round(x / gridSize) * gridSize + gridSize / 2,
      y: Math.round(y / gridSize) * gridSize + gridSize / 2,
    };
  }, []);

  const recalculatePath = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, placedTrees, navigationGrid);
    const mockHuman = mockState.entities.entities[1] as HumanEntity;

    const newPath = findPath(mockState, startPos, endPos, mockHuman);
    setPath(newPath);
  }, [placedBuildings, placedTrees, navigationGrid, startPos, endPos]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const snappedPos = snapToGrid(x, y);

      if (placementMode === 'start') {
        setStartPos(snappedPos);
      } else if (placementMode === 'end') {
        setEndPos(snappedPos);
      } else if (placementMode === 'tree') {
        // Check if position is occupied by building or tree
        const isOccupiedByBuilding = placedBuildings.some(
          (b) => Math.abs(b.position.x - snappedPos.x) < 25 && Math.abs(b.position.y - snappedPos.y) < 25,
        );
        const isOccupiedByTree = placedTrees.some(
          (t) => Math.abs(t.position.x - snappedPos.x) < 25 && Math.abs(t.position.y - snappedPos.y) < 25,
        );

        if (!isOccupiedByBuilding && !isOccupiedByTree) {
          const newTree = createTreeEntity(nextTreeId, snappedPos);

          // Update navigation grid - trees block movement
          const tempGrid = {
            staticObstacles: new Uint8Array(navigationGrid.staticObstacles),
            gateOwners: [...navigationGrid.gateOwners],
          };
          const tempState = {
            mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            navigationGrid: tempGrid,
          } as GameWorldState;

          updateNavigationGridSector(tempState, snappedPos, newTree.radius, true, null);

          setNavigationGrid(tempGrid);
          setPlacedTrees((prev) => [...prev, newTree]);
          setNextTreeId((prev) => prev + 1);
        }
      } else if (placementMode === 'obstacle' || placementMode === 'gate') {
        const isOccupied = placedBuildings.some(
          (b) => Math.abs(b.position.x - snappedPos.x) < 15 && Math.abs(b.position.y - snappedPos.y) < 15,
        );

        if (!isOccupied) {
          const buildingType = placementMode === 'gate' ? BuildingType.Gate : BuildingType.Palisade;
          const ownerId = 1; // Player's tribe
          const newBuilding = createBuildingEntity(nextBuildingId, buildingType, snappedPos, ownerId);

          // Update navigation grid
          const tempGrid = {
            staticObstacles: new Uint8Array(navigationGrid.staticObstacles),
            gateOwners: [...navigationGrid.gateOwners],
          };
          const tempState = {
            mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            navigationGrid: tempGrid,
          } as GameWorldState;

          // Store ownerId only for gates to enable owner-specific pathfinding; palisades block all entities
          const gateOwnerId = buildingType === BuildingType.Gate ? ownerId : null;
          updateNavigationGridSector(tempState, snappedPos, newBuilding.radius, true, gateOwnerId);

          setNavigationGrid(tempGrid);
          setPlacedBuildings((prev) => [...prev, newBuilding]);
          setNextBuildingId((prev) => prev + 1);
        }
      }
    },
    [placementMode, snapToGrid, placedBuildings, placedTrees, nextBuildingId, nextTreeId, navigationGrid],
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
    setPlacedBuildings([]);
    setPlacedTrees([]);
    setNextBuildingId(10);
    setNextTreeId(1000);
    setNavigationGrid(initNavigationGrid(CANVAS_WIDTH, CANVAS_HEIGHT));
    setPath(null);
    setStartPos({ x: 100, y: 300 });
    setEndPos({ x: 700, y: 300 });
  }, []);

  // Recalculate path when positions or obstacles change
  useEffect(() => {
    recalculatePath();
  }, [recalculatePath]);

  // Update time for tree sway animation
  useEffect(() => {
    const interval = setInterval(() => {
      setTime((t) => t + 16);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const mockState = createMockWorldState(placedBuildings, placedTrees, navigationGrid);

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

      // 3. Show blocked cells in navigation grid
      if (showObstacles) {
        const gridWidth = Math.ceil(CANVAS_WIDTH / NAV_GRID_RESOLUTION);
        for (let i = 0; i < navigationGrid.staticObstacles.length; i++) {
          if (navigationGrid.staticObstacles[i]) {
            const gx = i % gridWidth;
            const gy = Math.floor(i / gridWidth);
            const gateOwner = navigationGrid.gateOwners[i];

            if (gateOwner !== null) {
              // Gate (passable for owner)
              ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            } else {
              // Palisade (blocked)
              ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            }
            ctx.fillRect(gx * NAV_GRID_RESOLUTION, gy * NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION);
          }
        }
      }

      // 4. Trees
      for (const tree of placedTrees) {
        renderTree(ctx, tree, time);
      }

      // 5. Buildings
      for (const building of placedBuildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      // 6. Draw path
      if (path && path.length > 0) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        for (const waypoint of path) {
          ctx.lineTo(waypoint.x, waypoint.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw waypoints
        for (const waypoint of path) {
          ctx.fillStyle = '#00ffff';
          ctx.beginPath();
          ctx.arc(waypoint.x, waypoint.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Start position
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', startPos.x, startPos.y);

      // 8. End position
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(endPos.x, endPos.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('E', endPos.x, endPos.y);

      // 9. Mouse cursor preview
      if (mousePos) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [placedBuildings, placedTrees, navigationGrid, path, startPos, endPos, showGrid, showObstacles, mousePos, time]);

  const mockState = createMockWorldState(placedBuildings, placedTrees, navigationGrid);
  const mockHuman = mockState.entities.entities[1] as HumanEntity;
  const directPathBlocked = isPathBlocked(mockState, startPos, endPos, mockHuman);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Pathfinding Debug</Title>

        <SectionTitle>Placement Mode</SectionTitle>
        <Button
          onClick={() => setPlacementMode('obstacle')}
          style={{
            backgroundColor: placementMode === 'obstacle' ? '#666' : '#444',
            borderLeft: placementMode === 'obstacle' ? '3px solid #F44336' : 'none',
          }}
        >
          🧱 Place Palisade (Blocks)
        </Button>
        <Button
          onClick={() => setPlacementMode('gate')}
          style={{
            backgroundColor: placementMode === 'gate' ? '#666' : '#444',
            borderLeft: placementMode === 'gate' ? '3px solid #4CAF50' : 'none',
          }}
        >
          🚪 Place Gate (Passable)
        </Button>
        <Button
          onClick={() => setPlacementMode('tree')}
          style={{
            backgroundColor: placementMode === 'tree' ? '#666' : '#444',
            borderLeft: placementMode === 'tree' ? '3px solid #76a331' : 'none',
          }}
        >
          🌲 Place Tree (Blocks)
        </Button>
        <Button
          onClick={() => setPlacementMode('start')}
          style={{
            backgroundColor: placementMode === 'start' ? '#666' : '#444',
            borderLeft: placementMode === 'start' ? '3px solid #00ff00' : 'none',
          }}
        >
          🟢 Set Start Position
        </Button>
        <Button
          onClick={() => setPlacementMode('end')}
          style={{
            backgroundColor: placementMode === 'end' ? '#666' : '#444',
            borderLeft: placementMode === 'end' ? '3px solid #ff0000' : 'none',
          }}
        >
          🔴 Set End Position
        </Button>

        <SectionTitle>Display Options</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show Grid
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showObstacles} onChange={(e) => setShowObstacles(e.target.checked)} />
          Show Blocked Cells
        </CheckboxLabel>

        <SectionTitle>Path Info</SectionTitle>
        <InfoText>Direct path blocked: {directPathBlocked ? '❌ Yes' : '✅ No'}</InfoText>
        <InfoText>Path found: {path ? `✅ ${path.length} waypoints` : '❌ No path'}</InfoText>
        <InfoText>Buildings: {placedBuildings.length}</InfoText>
        <InfoText>Trees: {placedTrees.length}</InfoText>

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
          Click to place obstacles/gates/trees or set start/end positions. Path is calculated automatically using A*.
        </p>
        <p style={{ color: '#666', fontSize: '0.8rem' }}>
          Red overlay = blocked cells | Green overlay = gate cells (passable for owner)
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

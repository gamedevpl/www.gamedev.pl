import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import {
  BuildingType,
  BUILDING_DEFINITIONS,
  getBuildingTerritoryRadius,
} from '../game/entities/buildings/building-consts';
import { renderBuilding, renderGhostBuilding } from '../game/render/render-building';
import { IndexedWorldState } from '../game/world-index/world-index-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';
import { calculateWrappedDistance } from '../game/utils/math-utils';
import { NAV_GRID_RESOLUTION } from '../game/utils/navigation-utils';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState } from '../game/world-types';
import { paintTerrainOwnership } from '../game/entities/tribe/territory-utils';
import { renderAllTerritories } from '../game/render/render-territory';
import { renderPlantingZonesMetaball } from '../game/render/render-planting-zones';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../game/entities/tribe/territory-consts';

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

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

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
    position: { x: 0, y: 0 },
    radius: 10,
    isAdult: true,
    gender: 'male',
    age: 25,
  };

  // Mock hostile leader
  entitiesMap[2] = {
    id: 2,
    type: 'human',
    leaderId: 2,
    isPlayer: false,
    tribeInfo: { tribeBadge: '💀', tribeColor: '#F44336' },
    position: { x: 0, y: 0 },
    radius: 10,
    isAdult: true,
    gender: 'male',
    age: 30,
    tribeControl: {
      diplomacy: { 1: 'Hostile' },
    },
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
      all: () => [entitiesMap[1], entitiesMap[2]],
      byProperty: (prop: string, value: unknown) => {
        return Object.values(entitiesMap).filter(
          (e) =>
            (e as unknown as Record<string, unknown>).type === 'human' &&
            (e as unknown as Record<string, unknown>)[prop] === value,
        );
      },
      byRadius: () => [],
      byRect: () =>
        Object.values(entitiesMap).filter((e) => (e as unknown as Record<string, unknown>).type === 'human'),
    } as unknown as IndexedWorldState['search']['human'],
    berryBush: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['berryBush'],
    tree: { byRect: () => [], all: () => [] } as unknown as IndexedWorldState['search']['tree'],
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

export const BuildingsScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Palisade);
  const [isHostile, setIsHostile] = useState(false);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(10); // Start high to avoid collision with mock leaders

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

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

      const isOccupied = placedBuildings.some(
        (b) => Math.abs(b.position.x - snappedPos.x) < 5 && Math.abs(b.position.y - snappedPos.y) < 5,
      );

      if (!isOccupied) {
        const ownerId = isHostile ? 2 : 1;
        const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, ownerId);

        // Update territory
        const tempOwnership = [...terrainOwnership];
        const tempState = {
          mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
          terrainOwnership: tempOwnership,
        } as GameWorldState;

        const radius = getBuildingTerritoryRadius(selectedType);

        paintTerrainOwnership(snappedPos, radius, ownerId, tempState);
        setTerrainOwnership(tempOwnership);

        // Only add to placed buildings if it's not a BorderPost (border posts just paint territory)
        if (selectedType !== BuildingType.BorderPost) {
          setPlacedBuildings((prev) => [...prev, newBuilding]);
        }
        setNextBuildingId((prev) => prev + 1);
      }
    },
    [selectedType, isHostile, nextBuildingId, snapToGrid, placedBuildings, terrainOwnership],
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
    setNextBuildingId(10);
    setTerrainOwnership(
      new Array(
        Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
          Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
      ).fill(null),
    );
  }, []);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const viewportCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
      const mockState = createMockWorldState(placedBuildings, terrainOwnership);

      // 1. Background
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. Territory borders
      renderAllTerritories(ctx, mockState, viewportCenter, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, 1);

      // 3. Planting Zones (Metaball)
      renderPlantingZonesMetaball(ctx, mockState, viewportCenter, 1);

      // 4. Grid lines
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

      // 5. Individual Buildings (Skipping Planting Zones as they are now handled by metaball renderer)
      for (const building of placedBuildings) {
        if (building.buildingType !== BuildingType.PlantingZone) {
          renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
        }
      }

      // 6. Ghost Building
      if (mousePos) {
        renderGhostBuilding(ctx, mousePos, selectedType, true, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        });
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [placedBuildings, mousePos, selectedType, terrainOwnership]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Building Test</Title>
        <SectionTitle>Settings</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={isHostile} onChange={(e) => setIsHostile(e.target.checked)} />
          Show as Hostile
        </CheckboxLabel>

        <SectionTitle>Building Type</SectionTitle>
        {Object.values(BuildingType).map((type) => (
          <Button
            key={type}
            onClick={() => setSelectedType(type)}
            style={{
              backgroundColor: selectedType === type ? '#666' : '#444',
              borderLeft: selectedType === type ? '3px solid #4CAF50' : 'none',
            }}
          >
            {BUILDING_DEFINITIONS[type].icon} {BUILDING_DEFINITIONS[type].name}
          </Button>
        ))}

        <Button onClick={clearBuildings} style={{ backgroundColor: '#a33', marginTop: '20px', textAlign: 'center' }}>
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
          Click to place buildings. Test palisade connectivity by placing them adjacent to each other.
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

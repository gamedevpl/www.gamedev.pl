import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { BuildingEntity } from '../game/entities/buildings/building-types';
import {
  BuildingType,
  BUILDING_DEFINITIONS,
  getBuildingHitpoints,
  PALISADE_GATE_GRID_SIZE,
} from '../game/entities/buildings/building-consts';
import { renderBuilding, renderGhostBuilding } from '../game/render/render-building';
import { IndexedWorldState } from '../game/world-index/world-index-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';

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

// Mock search functions for IndexedWorldState
const createMockIndexedState = (buildings: BuildingEntity[]): IndexedWorldState => {
  return {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: {
      entities: buildings.reduce(
        (acc, b) => {
          acc[b.id] = b;
          return acc;
        },
        {} as Record<number, BuildingEntity>,
      ),
    },
    search: {
      building: {
        byRadius: () => buildings,
        byRect: () => buildings,
      },
      tree: {
        byRadius: () => [],
        byRect: () => [],
      },
      human: {
        byRadius: () => [],
        byRect: () => [],
        byProperty: () => [],
      },
      // Add other search types as needed
    },
  } as unknown as IndexedWorldState;
};

// Create a building entity for display
const createBuildingEntity = (
  id: number,
  buildingType: BuildingType,
  position: { x: number; y: number },
  ownerId: number | undefined,
  damagePercent: number = 0,
): BuildingEntity => {
  const definition = BUILDING_DEFINITIONS[buildingType];
  const maxHp = getBuildingHitpoints(buildingType);
  const currentHp = maxHp > 0 ? Math.round(maxHp * (1 - damagePercent / 100)) : undefined;

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
    hitpoints: currentHp,
    maxHitpoints: maxHp > 0 ? maxHp : undefined,
    storedItems: [],
    storageCapacity: 10,
    radius: Math.max(definition.dimensions.width, definition.dimensions.height) / 2,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    stateMachine: ['idle', { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
  };
};

export const BuildingsScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Palisade);
  const [damagePercent, setDamagePercent] = useState(0);
  const [showGhost, setShowGhost] = useState(false);
  const [isHostile, setIsHostile] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(1);

  // Snap position to grid for palisades and gates
  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    const gridSize = PALISADE_GATE_GRID_SIZE;
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    };
  }, []);

  // Check if a position already has a building
  const isPositionOccupied = useCallback(
    (pos: { x: number; y: number }): boolean => {
      return placedBuildings.some(
        (b) => Math.abs(b.position.x - pos.x) < 10 && Math.abs(b.position.y - pos.y) < 10,
      );
    },
    [placedBuildings],
  );

  // Handle canvas click to place building
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactiveMode) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const snappedPos = snapToGrid(x, y);

      if (!isPositionOccupied(snappedPos)) {
        const newBuilding = createBuildingEntity(
          nextBuildingId,
          selectedType,
          snappedPos,
          isHostile ? 999 : 1,
          damagePercent,
        );
        setPlacedBuildings((prev) => [...prev, newBuilding]);
        setNextBuildingId((prev) => prev + 1);
      }
    },
    [interactiveMode, selectedType, isHostile, damagePercent, nextBuildingId, snapToGrid, isPositionOccupied],
  );

  // Handle mouse move for ghost preview
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactiveMode) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setMousePos(snapToGrid(x, y));
    },
    [interactiveMode, snapToGrid],
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Clear all placed buildings
  const clearBuildings = useCallback(() => {
    setPlacedBuildings([]);
    setNextBuildingId(1);
  }, []);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const mapDimensions = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

      if (interactiveMode) {
        // Draw grid lines for guidance
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= CANVAS_WIDTH; x += PALISADE_GATE_GRID_SIZE) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, CANVAS_HEIGHT);
          ctx.stroke();
        }
        for (let y = 0; y <= CANVAS_HEIGHT; y += PALISADE_GATE_GRID_SIZE) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(CANVAS_WIDTH, y);
          ctx.stroke();
        }

        // Render all placed buildings
        const mockState = createMockIndexedState(placedBuildings);
        for (const building of placedBuildings) {
          renderBuilding(ctx, building, mockState);
        }

        // Render ghost at mouse position
        if (mousePos) {
          const isValid = !isPositionOccupied(mousePos);
          renderGhostBuilding(ctx, mousePos, selectedType, isValid, mapDimensions);
        }

        // Draw instruction
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click to place buildings. Use the sidebar to select building type.', CANVAS_WIDTH / 2, 30);
        ctx.fillText(`Placed: ${placedBuildings.length} buildings`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
      } else if (showAllTypes) {
        // Show all building types in a grid
        const buildingTypes = Object.values(BuildingType);
        const cols = 4;
        const cellWidth = CANVAS_WIDTH / cols;
        const cellHeight = CANVAS_HEIGHT / Math.ceil(buildingTypes.length / cols);

        buildingTypes.forEach((type, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * cellWidth + cellWidth / 2;
          const y = row * cellHeight + cellHeight / 2;

          const building = createBuildingEntity(index + 1, type, { x, y }, isHostile ? 999 : 1, damagePercent);

          const mockState = createMockIndexedState([building]);
          renderBuilding(ctx, building, mockState);

          // Draw label
          ctx.fillStyle = 'white';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(BUILDING_DEFINITIONS[type].name, x, y + 35);
        });
      } else if (showGhost) {
        // Show ghost building preview
        const center = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
        renderGhostBuilding(ctx, center, selectedType, true, mapDimensions);

        // Also show invalid ghost
        const invalidPos = { x: CANVAS_WIDTH / 2 + 100, y: CANVAS_HEIGHT / 2 };
        renderGhostBuilding(ctx, invalidPos, selectedType, false, mapDimensions);

        // Labels
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Valid Placement', center.x, center.y + 50);
        ctx.fillText('Invalid Placement', invalidPos.x, invalidPos.y + 50);
      } else {
        // Show single building type with different damage states
        const center = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

        // Show multiple damage states side by side for palisade/gate
        if (selectedType === BuildingType.Palisade || selectedType === BuildingType.Gate) {
          const damageStates = [0, 25, 50, 75];
          const spacing = 80;
          const startX = center.x - ((damageStates.length - 1) * spacing) / 2;

          damageStates.forEach((damage, index) => {
            const x = startX + index * spacing;
            const building = createBuildingEntity(index + 1, selectedType, { x, y: center.y }, isHostile ? 999 : 1, damage);

            const mockState = createMockIndexedState([building]);
            renderBuilding(ctx, building, mockState);

            // Draw damage label
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${damage}% damage`, x, center.y + 40);
          });

          // Draw main label
          ctx.fillStyle = 'white';
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(
            `${BUILDING_DEFINITIONS[selectedType].name} - ${isHostile ? 'Hostile' : 'Friendly'}`,
            center.x,
            80,
          );
        } else {
          // Single building for other types
          const building = createBuildingEntity(1, selectedType, center, isHostile ? 999 : 1, damagePercent);

          const mockState = createMockIndexedState([building]);
          renderBuilding(ctx, building, mockState);

          // Draw label
          ctx.fillStyle = 'white';
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(
            `${BUILDING_DEFINITIONS[selectedType].name} - ${isHostile ? 'Hostile' : 'Friendly'}`,
            center.x,
            center.y + 50,
          );
        }
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [selectedType, damagePercent, showGhost, isHostile, showAllTypes, interactiveMode, placedBuildings, mousePos, isPositionOccupied]);

  const buildingTypes = Object.entries(BuildingType).map(([key, value]) => ({
    name: key,
    value: value as BuildingType,
    definition: BUILDING_DEFINITIONS[value as BuildingType],
  }));

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Building Test</Title>

        <SectionTitle>Display Mode</SectionTitle>
        <CheckboxLabel>
          <input
            type="checkbox"
            checked={interactiveMode}
            onChange={(e) => {
              setInteractiveMode(e.target.checked);
              if (e.target.checked) {
                setShowAllTypes(false);
                setShowGhost(false);
              }
            }}
          />
          Interactive Placement Mode
        </CheckboxLabel>
        <CheckboxLabel>
          <input
            type="checkbox"
            checked={showAllTypes}
            onChange={(e) => setShowAllTypes(e.target.checked)}
            disabled={interactiveMode}
          />
          Show All Building Types
        </CheckboxLabel>
        <CheckboxLabel>
          <input
            type="checkbox"
            checked={showGhost}
            onChange={(e) => setShowGhost(e.target.checked)}
            disabled={showAllTypes || interactiveMode}
          />
          Show Ghost Preview
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={isHostile} onChange={(e) => setIsHostile(e.target.checked)} />
          Show as Hostile
        </CheckboxLabel>

        <SectionTitle>Building Type</SectionTitle>
        {buildingTypes.map((bt) => (
          <Button
            key={bt.name}
            onClick={() => setSelectedType(bt.value)}
            style={{
              backgroundColor: selectedType === bt.value ? '#666' : '#444',
              borderLeft: selectedType === bt.value ? '3px solid #4CAF50' : 'none',
            }}
          >
            {bt.definition.icon} {bt.definition.name}
          </Button>
        ))}

        <SectionTitle>Damage Level</SectionTitle>
        <SliderContainer>
          <SliderLabel>Damage: {damagePercent}%</SliderLabel>
          <Slider
            type="range"
            min="0"
            max="100"
            value={damagePercent}
            onChange={(e) => setDamagePercent(Number(e.target.value))}
          />
        </SliderContainer>

        {interactiveMode && (
          <Button
            onClick={clearBuildings}
            style={{ backgroundColor: '#a33', marginTop: '10px' }}
          >
            🗑️ Clear All Buildings
          </Button>
        )}

        <BackButton onClick={returnToIntro}>Back to Intro</BackButton>
      </Sidebar>
      <CanvasContainer>
        <Canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: interactiveMode ? 'crosshair' : 'default' }}
        />
        <p style={{ marginTop: '20px', color: '#888' }}>
          {interactiveMode
            ? 'Click on the canvas to place buildings. Select building type from sidebar.'
            : 'Use the controls on the left to preview different building types and states.'}
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

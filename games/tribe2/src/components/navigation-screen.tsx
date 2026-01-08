import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { useRafLoop } from 'react-use';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState, DebugPanelType } from '../game/world-types';
import {
  findPath,
  NAV_GRID_RESOLUTION,
  initNavigationGrid,
  updateNavigationGridSector,
  NAVIGATION_AGENT_RADIUS,
  isCellPassable,
  PADDING_MAX_WEIGHT,
} from '../game/utils/navigation-utils';
import { HumanEntity } from '../game/entities/characters/human/human-types';
import { HUMAN_MOVING, HUMAN_IDLE } from '../game/entities/characters/human/states/human-state-types';
import {
  vectorAdd,
  vectorScale,
  vectorNormalize,
  vectorRotate,
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
} from '../game/utils/math-utils';
import {
  SOIL_STEERING_SAMPLE_DISTANCE,
  SOIL_STEERING_SAMPLE_ANGLE,
} from '../game/entities/plants/soil-depletion-consts';
import { createSoilDepletionState } from '../game/entities/plants/soil-depletion-types';
import { TREE_RADIUS } from '../game/entities/plants/tree/tree-consts';
import { CHARACTER_RADIUS } from '../game/ui/ui-consts';
import {
  createTree,
  createBuilding,
  createHuman,
  removeEntity,
  entitiesUpdate,
} from '../game/entities/entities-update';
import { BuildingType, BUILDING_DEFINITIONS } from '../game/entities/buildings/building-consts';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../game/entities/tribe/territory-consts';
import { TransitionState } from '../game/tutorial/tutorial-types';
import { indexWorldState } from '../game/world-index/world-state-index';
import { interactionsUpdate } from '../game/interactions/interactions-update';
import { updateNavigationAI } from '../game/ai/navigation-ai-update';
import { visualEffectsUpdate } from '../game/visual-effects/visual-effects-update';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../game/game-consts';

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

const Button = styled.button<{ active?: boolean }>`
  background-color: ${(props) => (props.active ? '#666' : '#444')};
  color: white;
  border: ${(props) => (props.active ? '2px solid #4CAF50' : 'none')};
  padding: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border-radius: 4px;
  text-align: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: #666;
  }

  &:active {
    background-color: #888;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SliderContainer = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 15px;

  label {
    font-size: 0.8rem;
    color: #aaa;
    margin-bottom: 5px;
  }
`;

const BackButton = styled(Button)`
  background-color: #833;
  margin-top: auto;
  font-weight: bold;

  &:hover {
    background-color: #a44;
  }
`;

const InfoText = styled.p`
  font-size: 0.9rem;
  color: #888;
  margin: 5px 0;
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

type ObjectType = 'tree' | BuildingType | 'start' | 'end' | 'palisadeLine';

const createMockGameState = (): GameWorldState => {
  const terrainOwnershipSize =
    Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
    Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION);
  const gameState: GameWorldState = {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: { entities: {}, nextEntityId: 2 },
    navigationGrid: initNavigationGrid(CANVAS_WIDTH, CANVAS_HEIGHT),
    soilDepletion: createSoilDepletionState(),
    temperature: {
      sectors: {},
    },
    pathfindingQueue: [],
    notifications: [],
    visualEffects: [],
    nextVisualEffectId: 1,
    tutorialState: {
      isActive: false,
      highlightedEntityIds: [],
      activeUIHighlights: [],
      currentStepIndex: 0,
      completedSteps: [],
      transitionAlpha: 0,
      transitionState: TransitionState.INACTIVE,
      stepStartTime: null,
    },
    plantingZoneConnections: {},
    terrainOwnership: new Array(terrainOwnershipSize).fill(null),
    performanceMetrics: {
      currentBucket: { renderTime: 0, worldUpdateTime: 0, aiUpdateTime: 0 },
      history: [],
    },
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: false,
        build: false,
        chopping: false,
      },
      isManuallyMoving: false,
    },
    ecosystem: {
      lastUpdateTime: 0,
      preyGestationPeriod: 24,
      preyProcreationCooldown: 48,
      predatorGestationPeriod: 36,
      predatorProcreationCooldown: 72,
      preyHungerIncreasePerHour: 0.1,
      predatorHungerIncreasePerHour: 0.1,
      berryBushSpreadChance: 0.01,
      treeSpreadChance: 0.005,
    },
    tasks: {},
    scheduledEvents: [],
    nextScheduledEventId: 1,
    generationCount: 1,
    gameOver: false,
    viewportCenter: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    isPaused: false,
    exitConfirmation: 'inactive',
    buildMenuOpen: false,
    tribeModalOpen: false,
    cameraFollowingPlayer: false,
    cameraZoom: 1,
    masterVolume: 1,
    isMuted: false,
    uiButtons: [],
    tutorial: { steps: [] },
    lastAutosaveTime: Date.now(),
    autosaveIntervalSeconds: 0,
    debugPanel: DebugPanelType.None,
    debugPanelScroll: { x: 0, y: 0 },
    isDraggingDebugPanel: false,
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    isDraggingMinimap: false,
    minimapDragDistance: 0,
    isDraggingViewport: false,
    viewportDragButton: null,
    viewportDragDistance: 0,
    selectedBuildingType: null,
    selectedBuildingForRemoval: null,
  };
  return gameState;
};

export const NavigationScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState] = useState<GameWorldState>(createMockGameState());
  const [startPos, setStartPos] = useState<Vector2D | null>(null);
  const [endPos, setEndPos] = useState<Vector2D | null>(null);
  const [path, setPath] = useState<Vector2D[] | null>(null);
  const [pathIterations, setPathIterations] = useState<number>(0);
  const [placementMode, setPlacementMode] = useState<ObjectType>('tree');
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [obstacleOwnerId, setObstacleOwnerId] = useState<number>(1);
  const [humanTribeId, setHumanTribeId] = useState<number>(1);
  const [placedObjects, setPlacedObjects] = useState<
    { pos: Vector2D; type: 'tree' | BuildingType; ownerId: number | null }[]
  >([]);
  const [lineStartPos, setLineStartPos] = useState<Vector2D | null>(null);

  // Simulation State
  const [simulatedHuman, setSimulatedHuman] = useState<HumanEntity | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [obstaclePadding, setObstaclePadding] = useState(NAVIGATION_AGENT_RADIUS);
  const lastUpdateTimeRef = useRef<number>(0);

  const snapToGrid = useCallback((x: number, y: number): Vector2D => {
    return {
      x: Math.round(x / NAV_GRID_RESOLUTION) * NAV_GRID_RESOLUTION,
      y: Math.round(y / NAV_GRID_RESOLUTION) * NAV_GRID_RESOLUTION,
    };
  }, []);

  // Rebuild navigation grid whenever obstacles or padding change
  useEffect(() => {
    gameState.navigationGrid = initNavigationGrid(CANVAS_WIDTH, CANVAS_HEIGHT);
    gameState.entities.entities = {};
    gameState.entities.nextEntityId = 100;

    for (const obj of placedObjects) {
      let radius: number;
      if (obj.type === 'tree') {
        radius = TREE_RADIUS;
      } else {
        const dims = BUILDING_DEFINITIONS[obj.type].dimensions;
        radius = Math.max(dims.width, dims.height) / 2;
      }

      const navOwnerId = obj.type === BuildingType.Gate ? obj.ownerId ?? null : null;

      // Update Navigation Grid
      // Palisades, Gates, AND Trees block navigation in production
      const isBlocking = obj.type === BuildingType.Palisade || obj.type === BuildingType.Gate || obj.type === 'tree';

      if (isBlocking) {
        updateNavigationGridSector(gameState, obj.pos, radius, true, navOwnerId, obstaclePadding);
      }

      // Create actual entities for interactions
      if (obj.type === 'tree') {
        createTree(gameState.entities, obj.pos, gameState.time, 100);
      } else {
        const b = createBuilding(gameState.entities, obj.pos, obj.type as BuildingType, obj.ownerId || 0);
        b.isConstructed = true;
      }
    }

    // Recalculate static path for visualization
    if (startPos && endPos) {
      const mockHuman = {
        leaderId: humanTribeId,
        position: startPos,
        radius: CHARACTER_RADIUS,
      } as unknown as HumanEntity;
      const { path: newPath, iterations } = findPath(gameState, startPos, endPos, mockHuman);
      setPath(newPath);
      setPathIterations(iterations);
    }
  }, [placedObjects, obstaclePadding, startPos, endPos, humanTribeId, gameState]);

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
      } else if (placementMode === 'palisadeLine') {
        if (!lineStartPos) {
          setLineStartPos(snappedPos);
        } else {
          // Place a line of palisades
          const dist = calculateWrappedDistance(lineStartPos, snappedPos, CANVAS_WIDTH, CANVAS_HEIGHT);
          const dir = getDirectionVectorOnTorus(lineStartPos, snappedPos, CANVAS_WIDTH, CANVAS_HEIGHT);
          const normalizedDir = vectorNormalize(dir);

          const segments = Math.ceil(dist / 20);
          const newPalisades: { pos: Vector2D; type: BuildingType; ownerId: null }[] = [];

          for (let i = 0; i <= segments; i++) {
            const pos = vectorAdd(lineStartPos, vectorScale(normalizedDir, i * 20));
            const snappedSegmentPos = snapToGrid(pos.x, pos.y);

            // Avoid duplicates
            if (
              !placedObjects.some((o) => o.pos.x === snappedSegmentPos.x && o.pos.y === snappedSegmentPos.y) &&
              !newPalisades.some((o) => o.pos.x === snappedSegmentPos.x && o.pos.y === snappedSegmentPos.y)
            ) {
              newPalisades.push({ pos: snappedSegmentPos, type: BuildingType.Palisade, ownerId: null });
            }
          }

          setPlacedObjects((prev) => [...prev, ...newPalisades]);
          setLineStartPos(null);
        }
      } else {
        const existingIndex = placedObjects.findIndex((o) => o.pos.x === snappedPos.x && o.pos.y === snappedPos.y);

        if (existingIndex !== -1) {
          const existing = placedObjects[existingIndex];

          // Replace if different type
          if (
            placementMode !== existing.type &&
            (placementMode === 'tree' || Object.values(BuildingType).includes(placementMode as BuildingType))
          ) {
            setPlacedObjects((prev) => {
              const next = [...prev];
              next[existingIndex] = {
                pos: snappedPos,
                type: placementMode as 'tree' | BuildingType,
                ownerId: placementMode === BuildingType.Gate ? obstacleOwnerId : null,
              };
              return next;
            });
          } else {
            // Remove if same type
            setPlacedObjects((prev) => prev.filter((_, i) => i !== existingIndex));
          }
        } else {
          // Normal placement
          setPlacedObjects((prev) => [
            ...prev,
            {
              pos: snappedPos,
              type: placementMode as 'tree' | BuildingType,
              ownerId: placementMode === BuildingType.Gate ? obstacleOwnerId : null,
            },
          ]);
        }
      }
    },
    [placementMode, snapToGrid, obstacleOwnerId, placedObjects, lineStartPos],
  );

  const spawnHuman = () => {
    if (startPos && endPos) {
      if (simulatedHuman) {
        removeEntity(gameState.entities, simulatedHuman.id);
      }

      const human = createHuman(
        gameState.entities,
        startPos,
        gameState.time,
        'male',
        false,
        25,
        0,
        undefined,
        undefined,
        [],
        humanTribeId,
        { tribeBadge: '👤', tribeColor: '#4A90E2' },
      );

      human.target = endPos;
      human.activeAction = 'moving';
      human.stateMachine = [HUMAN_MOVING, { enteredAt: gameState.time }];

      if (!gameState.pathfindingQueue.includes(human.id)) {
        gameState.pathfindingQueue.push(human.id);
      }

      setSimulatedHuman(human);
      setIsSimulating(true);
    }
  };

  const resetHuman = () => {
    if (simulatedHuman) {
      removeEntity(gameState.entities, simulatedHuman.id);
    }
    setSimulatedHuman(null);
    setIsSimulating(false);
  };

  const [stopLoop, startLoop] = useRafLoop((time) => {
    if (lastUpdateTimeRef.current === 0) {
      lastUpdateTimeRef.current = time;
      return;
    }

    const realDeltaTime = (time - lastUpdateTimeRef.current) / 1000;
    lastUpdateTimeRef.current = time;

    if (!isSimulating || !simulatedHuman) return;

    // Ensure human is in the entities map (it might have been cleared by grid rebuild)
    if (!gameState.entities.entities[simulatedHuman.id]) {
      gameState.entities.entities[simulatedHuman.id] = simulatedHuman;
    }

    let realDeltaTimeSeconds = realDeltaTime * simSpeed;
    const MAX_REAL_TIME_DELTA = 1 / 60;
    let currentState: GameWorldState = gameState;

    while (realDeltaTimeSeconds > 0) {
      const indexedState = indexWorldState(currentState);
      const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

      const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
      indexedState.time += gameHoursDelta;

      entitiesUpdate({ gameState: indexedState, deltaTime });
      interactionsUpdate({ gameState: indexedState, deltaTime });
      updateNavigationAI(indexedState);
      visualEffectsUpdate(indexedState);

      currentState = indexedState;
      realDeltaTimeSeconds -= deltaTime;
    }

    // Sync back to stable reference if the loop returned a new object (via indexWorldState)
    if (currentState !== gameState) {
      Object.assign(gameState, currentState);
    }

    const updatedHuman = gameState.entities.entities[simulatedHuman.id] as HumanEntity;
    if (updatedHuman) {
      setSimulatedHuman({ ...updatedHuman });
    }
  });

  useEffect(() => {
    startLoop();
    return () => stopLoop();
  }, [startLoop, stopLoop]);

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
    setStartPos(null);
    setEndPos(null);
    setPath(null);
    setPathIterations(0);
    if (simulatedHuman) {
      removeEntity(gameState.entities, simulatedHuman.id);
    }
    setSimulatedHuman(null);
    setIsSimulating(false);
    setPlacedObjects([]);
    setLineStartPos(null);
    gameState.pathfindingQueue = [];
  }, [gameState, simulatedHuman]);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw grid
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

      // Draw actual blocked grid cells
      const gridWidth = Math.ceil(CANVAS_WIDTH / NAV_GRID_RESOLUTION);
      const gridHeight = Math.ceil(CANVAS_HEIGHT / NAV_GRID_RESOLUTION);

      for (let gy = 0; gy < gridHeight; gy++) {
        for (let gx = 0; gx < gridWidth; gx++) {
          const index = gy * gridWidth + gx;
          const isPhysicallyBlocked = !isCellPassable(gameState.navigationGrid, index, humanTribeId, false);
          const paddingWeight = gameState.navigationGrid.paddingCount[index];

          if (isPhysicallyBlocked) {
            // Red: Physically blocked (Solid wall or enemy gate)
            ctx.fillStyle = 'rgba(244, 67, 54, 0.5)';
            ctx.fillRect(gx * NAV_GRID_RESOLUTION, gy * NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION);
          } else if (paddingWeight > 0) {
            // Gradual Yellow/Orange: Pathfinding Padding (Penalty field)
            // Weight is 1-100 (approximately, can be higher if overlapping)
            const alpha = Math.min(0.6, 0.15 + (paddingWeight / PADDING_MAX_WEIGHT) * 0.45);
            ctx.fillStyle = `rgba(255, 235, 59, ${alpha})`;
            ctx.fillRect(gx * NAV_GRID_RESOLUTION, gy * NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION);
          } else if (gameState.navigationGrid.obstacleCount[index] > 0) {
            // Green: Physically passable obstacle (Friendly Gate core)
            ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
            ctx.fillRect(gx * NAV_GRID_RESOLUTION, gy * NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION, NAV_GRID_RESOLUTION);
          }
        }
      }

      // Draw source objects
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const obj of placedObjects) {
        let icon = '';
        if (obj.type === 'tree') {
          icon = '🌳';
        } else {
          icon = BUILDING_DEFINITIONS[obj.type].icon;
        }

        if (icon) {
          ctx.fillText(icon, obj.pos.x, obj.pos.y);
        }
      }

      // Draw path
      const activePath = simulatedHuman?.path || path;
      if (activePath && activePath.length > 1) {
        ctx.strokeStyle = simulatedHuman ? 'rgba(0, 255, 0, 0.3)' : '#00FF00';
        ctx.setLineDash(simulatedHuman ? [5, 5] : []);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(activePath[0].x, activePath[0].y);
        for (let i = 1; i < activePath.length; i++) {
          ctx.lineTo(activePath[i].x, activePath[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw waypoints
        ctx.fillStyle = '#00FF00';
        for (const point of activePath) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw start position
      if (startPos) {
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText('START', startPos.x, startPos.y - 12);
      }

      // Draw end position
      if (endPos) {
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(endPos.x, endPos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText('END', endPos.x, endPos.y - 12);
      }

      // Draw Simulated Human
      if (simulatedHuman) {
        const { position, direction, path: hPath } = simulatedHuman;

        // Human collision radius
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(position.x, position.y, CHARACTER_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        // Human body
        ctx.fillStyle = '#4A90E2';
        ctx.beginPath();
        ctx.arc(position.x, position.y, CHARACTER_RADIUS / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.stroke();

        // Direction indicator
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(position.x + direction.x * 20, position.y + direction.y * 20);
        ctx.stroke();

        // Target waypoint indicator
        const navTarget = hPath && hPath.length > 0 ? hPath[0] : null;
        if (navTarget) {
          ctx.strokeStyle = '#FFEB3B';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(position.x, position.y);
          ctx.lineTo(navTarget.x, navTarget.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw waypoint circle
          ctx.fillStyle = '#FFEB3B';
          ctx.beginPath();
          ctx.arc(navTarget.x, navTarget.y, 4, 0, Math.PI * 2);
          ctx.fill();

          // Visualize Collision Rails (isPathBlocked sampling)
          const dir = getDirectionVectorOnTorus(position, navTarget, CANVAS_WIDTH, CANVAS_HEIGHT);
          const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
          if (dist > 0.001) {
            const normX = dir.x / dist;
            const normY = dir.y / dist;
            const perpX = -normY;
            const perpY = normX;
            const lateralOffset = CHARACTER_RADIUS * 0.5;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            [lateralOffset, -lateralOffset, lateralOffset * 0.5, -lateralOffset * 0.5].forEach((offset) => {
              ctx.beginPath();
              ctx.moveTo(position.x + perpX * offset, position.y + perpY * offset);
              ctx.lineTo(navTarget.x + perpX * offset, navTarget.y + perpY * offset);
              ctx.stroke();
            });
          }
        }

        // Visualize Steering Samples
        const straightDir = vectorNormalize(direction);
        const leftDir = vectorRotate(straightDir, -SOIL_STEERING_SAMPLE_ANGLE);
        const rightDir = vectorRotate(straightDir, SOIL_STEERING_SAMPLE_ANGLE);

        [straightDir, leftDir, rightDir].forEach((dir, i) => {
          const samplePos = vectorAdd(position, vectorScale(dir, SOIL_STEERING_SAMPLE_DISTANCE));
          ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.moveTo(position.x, position.y);
          ctx.lineTo(samplePos.x, samplePos.y);
          ctx.stroke();
        });
      }

      // Draw line placement preview
      if (lineStartPos && mousePos) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(lineStartPos.x, lineStartPos.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw mouse cursor preview
      if (mousePos) {
        let icon = '';
        if (placementMode === 'tree') {
          icon = '🌳';
        } else if (placementMode === 'start') {
          icon = '🟢';
        } else if (placementMode === 'end') {
          icon = '🔴';
        } else if (placementMode === 'palisadeLine') {
          icon = BUILDING_DEFINITIONS[BuildingType.Palisade].icon;
        } else if (Object.values(BuildingType).includes(placementMode as BuildingType)) {
          icon = BUILDING_DEFINITIONS[placementMode as BuildingType].icon;
        }

        if (icon) {
          ctx.globalAlpha = 0.5;
          ctx.fillText(icon, mousePos.x, mousePos.y);
          ctx.globalAlpha = 1.0;
        }
      }
    };

    const animFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrame);
  }, [
    gameState,
    startPos,
    endPos,
    path,
    mousePos,
    placementMode,
    simulatedHuman,
    placedObjects,
    humanTribeId,
    lineStartPos,
  ]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Navigation Debug</Title>

        <SectionTitle>Placement Mode</SectionTitle>
        <Button
          active={placementMode === 'start'}
          onClick={() => {
            setPlacementMode('start');
            setLineStartPos(null);
          }}
        >
          🟢 Start Point
        </Button>
        <Button
          active={placementMode === 'end'}
          onClick={() => {
            setPlacementMode('end');
            setLineStartPos(null);
          }}
        >
          🔴 End Point
        </Button>
        <Button
          active={placementMode === 'tree'}
          onClick={() => {
            setPlacementMode('tree');
            setLineStartPos(null);
          }}
        >
          🌳 Tree (Radius {TREE_RADIUS})
        </Button>

        {Object.entries(BUILDING_DEFINITIONS).map(([type, def]) => (
          <Button
            key={type}
            active={placementMode === type}
            onClick={() => {
              setPlacementMode(type as BuildingType);
              setLineStartPos(null);
            }}
          >
            {def.icon} {def.name} ({def.dimensions.width}x{def.dimensions.height})
          </Button>
        ))}

        <Button
          active={placementMode === 'palisadeLine'}
          onClick={() => {
            setPlacementMode('palisadeLine');
            setLineStartPos(null);
          }}
        >
          🧱 Palisade Line
        </Button>

        <SectionTitle>Gate Ownership</SectionTitle>
        <Button active={obstacleOwnerId === 1} onClick={() => setObstacleOwnerId(1)}>
          👑 Player (ID: 1)
        </Button>
        <Button active={obstacleOwnerId === 2} onClick={() => setObstacleOwnerId(2)}>
          💀 Enemy (ID: 2)
        </Button>

        <SectionTitle>Human Tribe</SectionTitle>
        <Button active={humanTribeId === 1} onClick={() => setHumanTribeId(1)}>
          👤 Player (ID: 1)
        </Button>
        <Button active={humanTribeId === 2} onClick={() => setHumanTribeId(2)}>
          👹 Enemy (ID: 2)
        </Button>

        <SectionTitle>Simulation</SectionTitle>
        <Button onClick={spawnHuman} disabled={!startPos || !endPos}>
          👤 Spawn Human
        </Button>
        <Button onClick={() => setIsSimulating(!isSimulating)} active={isSimulating}>
          {isSimulating ? '⏸️ Pause' : '▶️ Play'}
        </Button>
        <Button onClick={resetHuman} style={{ backgroundColor: '#555' }}>
          🔄 Reset Human
        </Button>

        <SliderContainer>
          <label>Sim Speed: {simSpeed.toFixed(1)}x</label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={simSpeed}
            onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
          />
        </SliderContainer>

        <SliderContainer>
          <label>Obstacle Padding: {obstaclePadding}px</label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={obstaclePadding}
            onChange={(e) => setObstaclePadding(parseInt(e.target.value))}
          />
        </SliderContainer>

        <SectionTitle>Info</SectionTitle>
        <InfoText>Grid: {NAV_GRID_RESOLUTION}px</InfoText>
        <InfoText>Path Nodes: {simulatedHuman?.path?.length || path?.length || 0}</InfoText>
        <InfoText>A* Iterations: {pathIterations}</InfoText>
        <InfoText>Action: {simulatedHuman?.activeAction || 'idle'}</InfoText>
        <InfoText>Accel: {simulatedHuman?.acceleration.toFixed(2) || '0.00'}</InfoText>
        <InfoText>
          Status:{' '}
          {simulatedHuman?.activeAction === 'moving' && simulatedHuman.acceleration === 0
            ? '⚠️ STUCK'
            : simulatedHuman?.activeAction === 'idle' || simulatedHuman?.stateMachine[0] === HUMAN_IDLE
            ? '🏁 REACHED'
            : simulatedHuman
            ? '🏃 Moving'
            : '⏳ Idle'}
        </InfoText>
        <InfoText style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>
          Note: Click any tool on an existing object to replace or remove it. Use Palisade Line for multi-segment walls.
        </InfoText>

        <Button onClick={clearAll} style={{ backgroundColor: '#a33', marginTop: '20px' }}>
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
        <InfoText style={{ marginTop: '10px', textAlign: 'center' }}>
          Place Trees and Buildings to test pathfinding. Only Palisades and Gates physically block movement. Adjust
          padding to see how it affects real game navigation logic.
        </InfoText>
      </CanvasContainer>
    </ScreenContainer>
  );
};
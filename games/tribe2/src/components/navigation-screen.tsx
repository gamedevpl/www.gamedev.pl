import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { useRafLoop } from 'react-use';
import { Vector2D } from '../game/utils/math-types';
import { GameWorldState, UpdateContext } from '../game/world-types';
import {
  findPath,
  NAV_GRID_RESOLUTION,
  initNavigationGrid,
  updateNavigationGridSector,
} from '../game/utils/navigation-utils';
import { HumanEntity } from '../game/entities/characters/human/human-types';
import { Blackboard } from '../game/ai/behavior-tree/behavior-tree-blackboard';
import { AIType } from '../game/ai/ai-types';
import { humanMovingState } from '../game/entities/characters/human/states/human-moving-state';
import { HUMAN_MOVING, HUMAN_IDLE } from '../game/entities/characters/human/states/human-state-types';
import {
  vectorAdd,
  vectorScale,
  vectorNormalize,
  vectorRotate,
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
} from '../game/utils/math-utils';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../game/game-consts';
import {
  SOIL_STEERING_SAMPLE_DISTANCE,
  SOIL_STEERING_SAMPLE_ANGLE,
} from '../game/entities/plants/soil-depletion-consts';
import { createSoilDepletionState } from '../game/entities/plants/soil-depletion-types';
import { TREE_RADIUS } from '../game/entities/plants/tree/tree-consts';

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

type ObjectType = 'tree' | 'palisade' | 'gate' | 'start' | 'end' | 'palisadeLine';

const createMockGameState = (): GameWorldState => {
  return {
    time: 0,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    entities: { entities: {}, nextEntityId: 2 },
    navigationGrid: initNavigationGrid(CANVAS_WIDTH, CANVAS_HEIGHT),
    soilDepletion: createSoilDepletionState(),
    pathfindingQueue: [],
    notifications: [],
    visualEffects: [],
    nextVisualEffectId: 1,
    tutorialState: { isActive: false, highlightedEntityIds: [], activeUIHighlights: [] },
    plantingZoneConnections: {},
  } as unknown as GameWorldState;
};

const createMockHuman = (pos: Vector2D, leaderId: number): HumanEntity => {
  return {
    id: 1,
    type: 'human',
    position: { ...pos },
    radius: 10,
    leaderId: leaderId,
    isAdult: true,
    gender: 'male',
    age: 25,
    maxAge: 80,
    hunger: 0,
    hitpoints: 100,
    maxHitpoints: 100,
    food: [],
    maxFood: 10,
    ancestorIds: [],
    aiType: AIType.TaskBased,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    stateMachine: [HUMAN_MOVING, { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
    activeAction: 'moving',
  } as HumanEntity;
};

export const NavigationScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState] = useState<GameWorldState>(createMockGameState());
  const [startPos, setStartPos] = useState<Vector2D | null>(null);
  const [endPos, setEndPos] = useState<Vector2D | null>(null);
  const [path, setPath] = useState<Vector2D[] | null>(null);
  const [placementMode, setPlacementMode] = useState<ObjectType>('tree');
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [obstacleOwnerId, setObstacleOwnerId] = useState<number>(1);
  const [humanTribeId, setHumanTribeId] = useState<number>(1);
  const [placedObjects, setPlacedObjects] = useState<
    { pos: Vector2D; type: 'tree' | 'palisade' | 'gate'; ownerId: number | null }[]
  >([]);
  const [lineStartPos, setLineStartPos] = useState<Vector2D | null>(null);

  // Simulation State
  const [simulatedHuman, setSimulatedHuman] = useState<HumanEntity | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [obstaclePadding, setObstaclePadding] = useState(0);
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

    // Pass 1: Solid Padding (Trees, Palisades)
    for (const obj of placedObjects) {
      if (obj.type === 'tree' || obj.type === 'palisade') {
        const radius = obj.type === 'tree' ? TREE_RADIUS : 10;
        updateNavigationGridSector(gameState, obj.pos, radius + obstaclePadding, true, null);
      }
    }

    // Pass 2: Gate Padding
    for (const obj of placedObjects) {
      if (obj.type === 'gate') {
        updateNavigationGridSector(gameState, obj.pos, 10 + obstaclePadding, true, obj.ownerId);
      }
    }

    // Pass 3: Solid Cores (Ensures center of palisade is always blocked even if overlapping a gate)
    for (const obj of placedObjects) {
      if (obj.type === 'tree' || obj.type === 'palisade') {
        const radius = obj.type === 'tree' ? TREE_RADIUS : 10;
        updateNavigationGridSector(gameState, obj.pos, radius, true, null);
      }
    }

    // Pass 4: Gate Cores
    for (const obj of placedObjects) {
      if (obj.type === 'gate') {
        updateNavigationGridSector(gameState, obj.pos, 10, true, obj.ownerId);
      }
    }

    // Recalculate static path for visualization
    if (startPos && endPos) {
      const mockHuman = createMockHuman(startPos, humanTribeId);
      const newPath = findPath(gameState, startPos, endPos, mockHuman);
      setPath(newPath);
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
          const newPalisades: { pos: Vector2D; type: 'palisade'; ownerId: null }[] = [];

          for (let i = 0; i <= segments; i++) {
            const pos = vectorAdd(lineStartPos, vectorScale(normalizedDir, i * 20));
            const snappedSegmentPos = snapToGrid(pos.x, pos.y);

            // Avoid duplicates
            if (
              !placedObjects.some((o) => o.pos.x === snappedSegmentPos.x && o.pos.y === snappedSegmentPos.y) &&
              !newPalisades.some((o) => o.pos.x === snappedSegmentPos.x && o.pos.y === snappedSegmentPos.y)
            ) {
              newPalisades.push({ pos: snappedSegmentPos, type: 'palisade', ownerId: null });
            }
          }

          setPlacedObjects((prev) => [...prev, ...newPalisades]);
          setLineStartPos(null);
        }
      } else {
        const existingIndex = placedObjects.findIndex((o) => o.pos.x === snappedPos.x && o.pos.y === snappedPos.y);

        if (existingIndex !== -1) {
          const existing = placedObjects[existingIndex];
          // Replace palisade with gate
          if (placementMode === 'gate' && existing.type === 'palisade') {
            setPlacedObjects((prev) => {
              const next = [...prev];
              next[existingIndex] = { pos: snappedPos, type: 'gate', ownerId: obstacleOwnerId };
              return next;
            });
          } else {
            setPlacedObjects((prev) => prev.filter((_, i) => i !== existingIndex));
          }
        } else {
          // Normal placement with overlap validation
          setPlacedObjects((prev) => [
            ...prev,
            {
              pos: snappedPos,
              type: placementMode as 'tree' | 'palisade' | 'gate',
              ownerId: placementMode === 'gate' ? obstacleOwnerId : null,
            },
          ]);
        }
      }
    },
    [placementMode, snapToGrid, obstacleOwnerId, placedObjects, lineStartPos],
  );

  const spawnHuman = () => {
    if (startPos && endPos) {
      const human = createMockHuman(startPos, humanTribeId);
      const initialPath = findPath(gameState, startPos, endPos, human);

      human.target = endPos;
      human.path = initialPath || undefined;
      human.pathTarget = endPos;
      human.activeAction = 'moving';
      human.velocity = { x: 0, y: 0 };
      human.acceleration = 0;

      setSimulatedHuman(human);
      setIsSimulating(true);
    }
  };

  const resetHuman = () => {
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

    const deltaTime = realDeltaTime * simSpeed;
    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    gameState.time += gameHoursDelta;

    // Process pathfinding queue if needed
    if (gameState.pathfindingQueue.includes(simulatedHuman.id) && endPos) {
      const newPath = findPath(gameState, simulatedHuman.position, endPos, simulatedHuman);
      simulatedHuman.path = newPath || undefined;
      simulatedHuman.pathTarget = endPos;
      gameState.pathfindingQueue = gameState.pathfindingQueue.filter((id) => id !== simulatedHuman.id);
    }

    // Update state machine
    const context: UpdateContext = {
      gameState,
      deltaTime,
    };

    // Ensure human follows the path or target
    if (simulatedHuman.activeAction !== 'idle' && endPos) {
      simulatedHuman.target = endPos;

      const result = humanMovingState.update(simulatedHuman.stateMachine[1], {
        entity: simulatedHuman,
        updateContext: context,
      });

      if (result) {
        if (result.nextState === HUMAN_IDLE) {
          // ARRIVAL
          if (humanMovingState.onExit) {
            humanMovingState.onExit({ entity: simulatedHuman, updateContext: context }, HUMAN_IDLE);
          }
          simulatedHuman.stateMachine[0] = HUMAN_IDLE;
          simulatedHuman.stateMachine[1] = result.data;
          simulatedHuman.activeAction = 'idle';
          simulatedHuman.velocity = { x: 0, y: 0 };
          simulatedHuman.acceleration = 0;
          simulatedHuman.position = { ...endPos };
        } else {
          simulatedHuman.stateMachine[0] = result.nextState;
          simulatedHuman.stateMachine[1] = result.data;
          simulatedHuman.activeAction = 'moving';
        }
      }

      // Strict arrival detection
      const distToTarget = calculateWrappedDistance(simulatedHuman.position, endPos, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (distToTarget < 5) {
        if (humanMovingState.onExit) {
          humanMovingState.onExit({ entity: simulatedHuman, updateContext: context }, HUMAN_IDLE);
        }
        simulatedHuman.activeAction = 'idle';
        simulatedHuman.velocity = { x: 0, y: 0 };
        simulatedHuman.acceleration = 0;
        simulatedHuman.position = { ...endPos };
      }
    }

    // Apply Physics
    if (simulatedHuman.activeAction === 'moving') {
      const accelForce = vectorScale(vectorNormalize(simulatedHuman.direction), simulatedHuman.acceleration);
      simulatedHuman.forces.push(accelForce);
      simulatedHuman.forces.push(vectorScale(simulatedHuman.velocity, -0.1)); // Damping

      const totalForce = simulatedHuman.forces.reduce(vectorAdd, { x: 0, y: 0 });
      simulatedHuman.velocity = vectorAdd(simulatedHuman.velocity, vectorScale(totalForce, deltaTime));
      simulatedHuman.position = vectorAdd(simulatedHuman.position, vectorScale(simulatedHuman.velocity, deltaTime));
      simulatedHuman.forces = [];

      // Toroidal Wrapping
      simulatedHuman.position.x = ((simulatedHuman.position.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
      simulatedHuman.position.y = ((simulatedHuman.position.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT;
    } else {
      simulatedHuman.velocity = { x: 0, y: 0 };
      simulatedHuman.acceleration = 0;
    }

    setSimulatedHuman({ ...simulatedHuman });
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
    setSimulatedHuman(null);
    setIsSimulating(false);
    setPlacedObjects([]);
    setLineStartPos(null);
    gameState.pathfindingQueue = [];
  }, [gameState]);

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
          if (gameState.navigationGrid.staticObstacles[index]) {
            const ownerId = gameState.navigationGrid.gateOwners[index];
            if (ownerId === null) {
              ctx.fillStyle = 'rgba(244, 67, 54, 0.4)'; // Red for always blocked
            } else {
              ctx.fillStyle = ownerId === humanTribeId ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';
            }
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
        if (obj.type === 'tree') icon = '🌳';
        else if (obj.type === 'palisade') icon = '🧱';
        else if (obj.type === 'gate') icon = '🚪';

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

        // Human body
        ctx.fillStyle = '#4A90E2';
        ctx.beginPath();
        ctx.arc(position.x, position.y, 10, 0, Math.PI * 2);
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
        if (hPath && hPath.length > 0) {
          ctx.strokeStyle = '#FFEB3B';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(position.x, position.y);
          ctx.lineTo(hPath[0].x, hPath[0].y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw waypoint circle
          ctx.fillStyle = '#FFEB3B';
          ctx.beginPath();
          ctx.arc(hPath[0].x, hPath[0].y, 4, 0, Math.PI * 2);
          ctx.fill();
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
        if (placementMode === 'tree') icon = '🌳';
        else if (placementMode === 'palisade' || placementMode === 'palisadeLine') icon = '🧱';
        else if (placementMode === 'gate') icon = '🚪';
        else if (placementMode === 'start') icon = '🟢';
        else if (placementMode === 'end') icon = '🔴';

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
          🌳 Tree (Radius 20)
        </Button>
        <Button
          active={placementMode === 'palisade'}
          onClick={() => {
            setPlacementMode('palisade');
            setLineStartPos(null);
          }}
        >
          🧱 Palisade (20x20)
        </Button>
        <Button
          active={placementMode === 'palisadeLine'}
          onClick={() => {
            setPlacementMode('palisadeLine');
            setLineStartPos(null);
          }}
        >
          🧱 Palisade Line
        </Button>
        <Button
          active={placementMode === 'gate'}
          onClick={() => {
            setPlacementMode('gate');
            setLineStartPos(null);
          }}
        >
          🚪 Gate (20x20)
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
        <InfoText>Action: {simulatedHuman?.activeAction || 'idle'}</InfoText>
        <InfoText>Accel: {simulatedHuman?.acceleration.toFixed(2) || '0.00'}</InfoText>
        <InfoText>
          Status:{' '}
          {simulatedHuman?.activeAction === 'moving' && simulatedHuman.acceleration === 0
            ? '⚠️ STUCK'
            : simulatedHuman?.activeAction === 'idle'
            ? '🏁 REACHED'
            : simulatedHuman
            ? '🏃 Moving'
            : '⏳ Idle'}
        </InfoText>
        <InfoText style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>
          Note: Click Gate tool on an existing Palisade to replace it. Use Palisade Line for multi-segment walls.
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
          Place Trees, Palisades, and Gates to test pathfinding. Adjust padding to see how it affects real game
          navigation logic. Multi-pass grid rebuild ensures gates remain passable even with padding.
        </InfoText>
      </CanvasContainer>
    </ScreenContainer>
  );
};

import { FunctionComponent } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { Position, GameState, LevelConfig, Monster } from "./gameplay-types";
import { drawGrid, drawPlayer, drawMonsters, drawGoal, drawObstacles } from "./grid-render";
import { generateMonsters, moveMonsters, checkCollision } from "./monster-logic";

interface GameplayProps {
  level: number;
  score: number;
  onGameOver: () => void;
  onLevelComplete: () => void;
  updateScore: (newScore: number) => void;
  updateSteps: (newSteps: number) => void;
}

const CELL_SIZE = 40;
const MONSTER_SPAWN_INTERVAL = 13;

const getLevelConfig = (level: number): LevelConfig => {
  return {
    gridSize: {
      width: Math.min(10 + Math.floor(level / 2), 20),
      height: Math.min(10 + Math.floor(level / 2), 20)
    },
    initialMonsterCount: 0,
    obstacleCount: Math.min(5 + level * 2, 30)
  };
};

export const Gameplay: FunctionComponent<GameplayProps> = ({
  level,
  score,
  onGameOver,
  onLevelComplete,
  updateScore,
  updateSteps
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    playerPosition: { x: 0, y: 0 },
    goal: { x: 0, y: 0 },
    obstacles: [],
    monsters: [],
    steps: 0
  });
  const [levelConfig, setLevelConfig] = useState<LevelConfig>(getLevelConfig(level));

  useEffect(() => {
    const newLevelConfig = getLevelConfig(level);
    setLevelConfig(newLevelConfig);
    initializeGame(newLevelConfig);
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = levelConfig.gridSize.width * CELL_SIZE;
      canvas.height = levelConfig.gridSize.height * CELL_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawGame(ctx);
      }
    }
  }, [gameState, levelConfig]);

  const initializeGame = (config: LevelConfig) => {
    const playerPosition = { x: 0, y: 0 };
    const goal = { x: config.gridSize.width - 1, y: config.gridSize.height - 1 };
    const obstacles = generateObstacles(config, playerPosition, goal);
    const monsters: Monster[] = []; // Start with no monsters
    setGameState({
      playerPosition,
      goal,
      obstacles,
      monsters,
      steps: 0
    });
  };

  const generateObstacles = (config: LevelConfig, playerPosition: Position, goal: Position): Position[] => {
    const obstacles: Position[] = [];
    const allPositions = getAllGridPositions(config.gridSize);
    const availablePositions = allPositions.filter(pos => 
      !isPositionEqual(pos, playerPosition) && !isPositionEqual(pos, goal)
    );

    for (let i = 0; i < config.obstacleCount; i++) {
      if (availablePositions.length > 0) {
        const index = Math.floor(Math.random() * availablePositions.length);
        obstacles.push(availablePositions[index]);
        availablePositions.splice(index, 1);
      }
    }

    // Ensure there's a path from start to finish
    if (!hasPath(playerPosition, goal, obstacles, config.gridSize)) {
      return generateObstacles(config, playerPosition, goal);
    }

    return obstacles;
  };

  const getAllGridPositions = (gridSize: { width: number; height: number }): Position[] => {
    const positions: Position[] = [];
    for (let x = 0; x < gridSize.width; x++) {
      for (let y = 0; y < gridSize.height; y++) {
        positions.push({ x, y });
      }
    }
    return positions;
  };

  const isPositionEqual = (pos1: Position, pos2: Position): boolean => {
    return pos1.x === pos2.x && pos1.y === pos2.y;
  };

  const hasPath = (start: Position, end: Position, obstacles: Position[], gridSize: { width: number; height: number }): boolean => {
    const queue: Position[] = [start];
    const visited: boolean[][] = Array(gridSize.height).fill(false).map(() => Array(gridSize.width).fill(false));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (isPositionEqual(current, end)) {
        return true;
      }

      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 }
      ];

      for (const neighbor of neighbors) {
        if (
          neighbor.x >= 0 && neighbor.x < gridSize.width &&
          neighbor.y >= 0 && neighbor.y < gridSize.height &&
          !visited[neighbor.y][neighbor.x] &&
          !obstacles.some(obs => isPositionEqual(obs, neighbor))
        ) {
          queue.push(neighbor);
          visited[neighbor.y][neighbor.x] = true;
        }
      }
    }

    return false;
  };

  const drawGame = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, levelConfig.gridSize.width * CELL_SIZE, levelConfig.gridSize.height * CELL_SIZE);
    drawGrid(ctx, levelConfig.gridSize.width, levelConfig.gridSize.height, CELL_SIZE);
    drawObstacles(ctx, gameState.obstacles, CELL_SIZE);
    drawPlayer(ctx, gameState.playerPosition, CELL_SIZE);
    drawMonsters(ctx, gameState.monsters, CELL_SIZE);
    drawGoal(ctx, gameState.goal, CELL_SIZE);
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    const newPosition = { ...gameState.playerPosition };
    let moved = false;

    switch (e.key) {
      case "ArrowUp":
        if (newPosition.y > 0) {
          newPosition.y--;
          moved = true;
        }
        break;
      case "ArrowDown":
        if (newPosition.y < levelConfig.gridSize.height - 1) {
          newPosition.y++;
          moved = true;
        }
        break;
      case "ArrowLeft":
        if (newPosition.x > 0) {
          newPosition.x--;
          moved = true;
        }
        break;
      case "ArrowRight":
        if (newPosition.x < levelConfig.gridSize.width - 1) {
          newPosition.x++;
          moved = true;
        }
        break;
    }

    if (moved && !isColliding(newPosition, gameState.obstacles)) {
      const newSteps = gameState.steps + 1;
      const newMonsters = moveMonsters(gameState.monsters, newPosition, levelConfig.gridSize, gameState.obstacles);
      
      let updatedMonsters = [...newMonsters];
      if (newSteps % MONSTER_SPAWN_INTERVAL === 0) {
        const newMonster = generateMonsters(1, levelConfig.gridSize, gameState.obstacles, updatedMonsters.map(m => m.position), newPosition)[0];
        if (newMonster) {
          updatedMonsters.push(newMonster);
        }
      }

      setGameState(prevState => ({
        ...prevState,
        playerPosition: newPosition,
        monsters: updatedMonsters,
        steps: newSteps % MONSTER_SPAWN_INTERVAL
      }));

      updateScore(score + 1);
      updateSteps(newSteps);

      if (isGoalReached(newPosition, gameState.goal)) {
        onLevelComplete();
      }

      if (checkCollision(newPosition, updatedMonsters)) {
        onGameOver();
      }
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [gameState, levelConfig]);

  const isColliding = (position: Position, obstacles: Position[]): boolean => {
    return obstacles.some(obstacle => obstacle.x === position.x && obstacle.y === position.y);
  };

  const isGoalReached = (player: Position, goal: Position): boolean => {
    return player.x === goal.x && player.y === goal.y;
  };

  return (
    <div className="gameplay">
      <h2>Level: {level}</h2>
      <h3>Score: {score}</h3>
      <h3>Steps: {gameState.steps}</h3>
      <canvas
        ref={canvasRef}
        style={{ border: '1px solid white' }}
      />
    </div>
  );
};
import { FunctionComponent } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { Position, GameState, LevelConfig, Monster, Bonus, BonusType, Explosion } from "./gameplay-types";
import { drawGrid, drawPlayer, drawMonsters, drawGoal, drawObstacles, drawBonuses, drawTimeBombs, drawExplosions } from "./grid-render";
import { generateMonsters, moveMonsters, checkCollision, checkLandMineCollision, checkTimeBombExplosion, isPlayerInExplosionRange } from "./monster-logic";

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
const BONUS_DURATION = 13;

const getLevelConfig = (level: number): LevelConfig => {
  return {
    gridSize: {
      width: Math.min(10 + Math.floor(level / 2), 20),
      height: Math.min(10 + Math.floor(level / 2), 20)
    },
    initialMonsterCount: 0,
    obstacleCount: Math.min(5 + level * 2, 30),
    initialBonusCount: Math.min(1 + Math.floor(level / 3), 3)
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
    steps: 0,
    bonuses: [],
    activeBonuses: [],
    explosions: [],
    timeBombs: [],
    crusherActive: false,
    builderActive: false
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
    const monsters: Monster[] = [];
    const bonuses = generateBonuses(config, playerPosition, goal, obstacles);
    setGameState({
      playerPosition,
      goal,
      obstacles,
      monsters,
      steps: 0,
      bonuses,
      activeBonuses: [],
      explosions: [],
      timeBombs: [],
      crusherActive: false,
      builderActive: false
    });
  };

  const generateObstacles = (config: LevelConfig, playerPosition: Position, goal: Position): Position[] => {
    const obstacles: Position[] = [];
    const allPositions = getAllGridPositions(config.gridSize);
    const availablePositions = allPositions.filter(pos => 
      !isPositionEqual(pos, playerPosition) &&
      !isPositionEqual(pos, goal)
    );

    for (let i = 0; i < config.obstacleCount; i++) {
      if (availablePositions.length > 0) {
        const index = Math.floor(Math.random() * availablePositions.length);
        obstacles.push(availablePositions[index]);
        availablePositions.splice(index, 1);
      }
    }

    return obstacles;
  };

  const generateBonuses = (config: LevelConfig, playerPosition: Position, goal: Position, obstacles: Position[]): Bonus[] => {
    const bonuses: Bonus[] = [];
    const allPositions = getAllGridPositions(config.gridSize);
    const availablePositions = allPositions.filter(pos => 
      !isPositionEqual(pos, playerPosition) &&
      !isPositionEqual(pos, goal) &&
      !obstacles.some(obs => isPositionEqual(obs, pos))
    );

    const bonusTypes = Object.values(BonusType);

    for (let i = 0; i < config.initialBonusCount; i++) {
      if (availablePositions.length > 0) {
        const index = Math.floor(Math.random() * availablePositions.length);
        const bonusType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
        bonuses.push({
          type: bonusType,
          position: availablePositions[index]
        });
        availablePositions.splice(index, 1);
      }
    }

    return bonuses;
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

  const drawGame = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, levelConfig.gridSize.width * CELL_SIZE, levelConfig.gridSize.height * CELL_SIZE);
    drawGrid(ctx, levelConfig.gridSize.width, levelConfig.gridSize.height, CELL_SIZE);
    drawObstacles(ctx, gameState.obstacles, CELL_SIZE);
    drawBonuses(ctx, gameState.bonuses, CELL_SIZE);
    drawExplosions(ctx, gameState.explosions, CELL_SIZE);
    drawTimeBombs(ctx, gameState.timeBombs, CELL_SIZE);
    drawPlayer(ctx, gameState.playerPosition, CELL_SIZE, gameState.activeBonuses.some(bonus => bonus.type === BonusType.CapOfInvisibility));
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

    let activeBonuses = gameState.activeBonuses;
    let crusherActive = activeBonuses.some(bonus => bonus.type === BonusType.Crusher);
    let builderActive = activeBonuses.some(bonus => bonus.type === BonusType.Builder);

    if (moved && (crusherActive || !isColliding(newPosition, gameState.obstacles))) {
      const newSteps = gameState.steps + 1;
      let newBonuses = [...gameState.bonuses];
      let landMines = newBonuses.filter(bonus => bonus.type === BonusType.LandMine).map(bonus => bonus.position);
      let timeBombs = gameState.timeBombs.map(bomb => ({ ...bomb, timer: bomb.timer - 1 }));
      let obstacles = [...gameState.obstacles];
      let explosions: Explosion[] = []; // explosions last for only one step

      // Check if player collected a bonus
      const collectedBonusIndex = newBonuses.findIndex(bonus => isPositionEqual(bonus.position, newPosition));
      if (collectedBonusIndex !== -1) {
        const collectedBonus = newBonuses[collectedBonusIndex];
        newBonuses.splice(collectedBonusIndex, 1);

        switch (collectedBonus.type) {
          case BonusType.LandMine:
            explosions.push({position: collectedBonus.position})
            break;
          case BonusType.TimeBomb:
            timeBombs.push({ position: newPosition, timer: BONUS_DURATION });
            break;
          case BonusType.Crusher:
          case BonusType.Builder:
          case BonusType.ConfusedMonsters:
          case BonusType.CapOfInvisibility:
              activeBonuses.push({ type: collectedBonus.type, duration: BONUS_DURATION })
            break;
        }
      }

      // If bonus duration reached 0, deactivate the bonus
      activeBonuses = activeBonuses.filter(bonus => {
        if (bonus.duration > 0) {
          bonus.duration--;
          return true;
        }
        return false;
      });

      crusherActive = activeBonuses.some(bonus => bonus.type === BonusType.Crusher);
      builderActive = activeBonuses.some(bonus => bonus.type === BonusType.Builder);

      // Apply Crusher bonus effect
      if (crusherActive) {
        obstacles = obstacles.filter(obs => !isPositionEqual(obs, newPosition));
      }

      // Apply Builder bonus effect
      if (builderActive) {
        const newObstacle = { ...gameState.playerPosition };
        if (!obstacles.some(obs => isPositionEqual(obs, newObstacle))) {
          obstacles.push(newObstacle);
        }
      }

      const isInvisible = activeBonuses.some(bonus => bonus.type === BonusType.CapOfInvisibility);
      const isConfused = activeBonuses.some(bonus => bonus.type === BonusType.ConfusedMonsters);
      let newMonsters = moveMonsters(gameState.monsters, newPosition, levelConfig.gridSize, obstacles, isInvisible, isConfused);
      
      if (newSteps % MONSTER_SPAWN_INTERVAL === 0) {
        const newMonster = generateMonsters(1, levelConfig.gridSize, obstacles, newMonsters.map(m => m.position), newPosition)[0];
        if (newMonster) {
          newMonsters.push(newMonster);
        }
      }

      // Check for monster elimination by land mines
      newMonsters = checkLandMineCollision(newMonsters, landMines, explosions);
      landMines = landMines.filter(mine => !newMonsters.some(monster => isPositionEqual(monster.position, mine)));

      // Check for time bomb explosions
      explosions.push(...timeBombs.filter(bomb => bomb.timer === 0).map(bomb => ({position: bomb.position})));
      timeBombs = timeBombs.filter(bomb => bomb.timer > 0);

      // Eliminate monsters which are in range of explosion
      newMonsters = newMonsters.filter(monster => !explosions.some(explosion => checkTimeBombExplosion(monster, explosion)));

      setGameState(prevState => ({
        ...prevState,
        playerPosition: newPosition,
        monsters: newMonsters,
        steps: newSteps,
        bonuses: newBonuses,
        activeBonuses,
        explosions,
        timeBombs,
        crusherActive,
        builderActive,
        obstacles
      }));

      updateScore(score + 1);
      updateSteps(newSteps);

      if (isGoalReached(newPosition, gameState.goal)) {
        onLevelComplete();
      }

      if ((!isInvisible && checkCollision(newPosition, newMonsters)) || isPlayerInExplosionRange(newPosition, explosions)) {
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
      <div className="hud">
        Level: {level}, Score: {score}, Steps: {gameState.steps}
      </div>
      <canvas
        ref={canvasRef}
        style={{ border: '1px solid white' }}
      />
    </div>
  );
};
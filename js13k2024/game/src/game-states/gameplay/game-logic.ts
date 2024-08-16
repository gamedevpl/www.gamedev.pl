import { GameState, Position, Monster, LevelConfig, Direction, BonusType, Bonus, ActiveBonus } from './gameplay-types';
import {
  moveMonsters,
  checkCollision,
  checkLandMineCollision,
  checkTimeBombExplosion,
  isPlayerInExplosionRange,
} from './monster-logic';

const generateRandomPosition = (width: number, height: number): Position => ({
  x: Math.floor(Math.random() * width),
  y: Math.floor(Math.random() * height),
});

const isPositionEqual = (pos1: Position, pos2: Position): boolean => pos1.x === pos2.x && pos1.y === pos2.y;

const isPositionOccupied = (position: Position, occupiedPositions: Position[]): boolean =>
  occupiedPositions.some((pos) => isPositionEqual(pos, position));

export const initializeGame = (level: number): [GameState, LevelConfig] => {
  const config = getLevelConfig(level);
  const { width, height } = config.gridSize;

  const playerPosition = generateRandomPosition(0, height - 1);
  const obstacles: Position[] = [];
  const monsters: Monster[] = [];
  const bonuses: Bonus[] = [];

  // Generate goal on the opposite end of the grid
  const goal: Position = {
    x: width - 2 - playerPosition.x,
    y: height - 2 - playerPosition.y,
  };

  // Generate obstacles
  for (let i = 0; i < config.obstacleCount; i++) {
    let obstaclePosition;
    do {
      obstaclePosition = generateRandomPosition(width, height);
    } while (
      isPositionEqual(obstaclePosition, playerPosition) ||
      isPositionEqual(obstaclePosition, goal) ||
      isPositionOccupied(obstaclePosition, obstacles)
    );
    obstacles.push(obstaclePosition);
  }

  // Generate bonuses
  for (let i = 0; i < config.initialBonusCount; i++) {
    let bonusPosition;
    do {
      bonusPosition = generateRandomPosition(width, height);
    } while (
      isPositionEqual(bonusPosition, playerPosition) ||
      isPositionEqual(bonusPosition, goal) ||
      isPositionOccupied(bonusPosition, obstacles) ||
      isPositionOccupied(
        bonusPosition,
        bonuses.map((b) => b.position),
      )
    );
    bonuses.push({ position: bonusPosition, type: getRandomBonusType() });
  }

  const gameState = {
    playerPosition,
    goal,
    obstacles,
    monsters,
    steps: 0,
    monsterSpawnSteps: 0,
    bonuses,
    activeBonuses: [],
    explosions: [],
    timeBombs: [],
    landMines: [],
    crusherActive: false,
    builderActive: false,
    score: 0,
    isLevelComplete: false,
    isGameOver: false,
  };

  // Spawn monsters
  for (let i = 0; i < config.initialMonsterCount; i++) {
    spawnMonster(gameState, config.gridSize);
  }

  return [gameState, config];
};

export const handleKeyPress = (e: KeyboardEvent, gameState: GameState, levelConfig: LevelConfig): GameState => {
  const newGameState = { ...gameState };
  const direction = getDirectionFromKey(e.key);

  if (direction !== null) {
    const oldPosition = newGameState.playerPosition;
    const newPosition = getNewPosition(newGameState.playerPosition, direction);

    if (gameState.crusherActive && gameState.obstacles.find((obstacle) => isPositionEqual(newPosition, obstacle))) {
      newGameState.obstacles = gameState.obstacles.filter((obstacle) => !isPositionEqual(newPosition, obstacle));
    }

    if (isValidMove(newPosition, newGameState, levelConfig.gridSize)) {
      newGameState.playerPosition = newPosition;
      newGameState.steps++;
      newGameState.monsterSpawnSteps++;

      // Check for goal
      if (isPositionEqual(newPosition, newGameState.goal)) {
        newGameState.isLevelComplete = true;
        newGameState.score += calculateLevelScore(newGameState);
        return newGameState;
      }

      // Check for bonuses
      const collectedBonus = newGameState.bonuses.find((bonus) => isPositionEqual(bonus.position, newPosition));
      if (collectedBonus) {
        newGameState.bonuses = newGameState.bonuses.filter((bonus) => !isPositionEqual(bonus.position, newPosition));
        applyBonus(newGameState, collectedBonus.type);
      }

      // Spawn monster every 13th step
      if (newGameState.monsterSpawnSteps >= 13) {
        spawnMonster(newGameState, levelConfig.gridSize);
        newGameState.monsterSpawnSteps = 0;
      }

      // Move monsters
      newGameState.monsters = moveMonsters(
        newGameState.monsters,
        newGameState.playerPosition,
        levelConfig.gridSize,
        newGameState.obstacles,
        newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
        newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.ConfusedMonsters),
      );

      // Check for collisions with monsters
      if (checkCollision(newGameState.playerPosition, newGameState.monsters)) {
        newGameState.isGameOver = true;
        return newGameState;
      }

      // Check for land mine collisions
      const [newMonsters, newExplosions] = checkLandMineCollision(newGameState.monsters, newGameState.landMines);

      newGameState.monsters = newMonsters;
      newGameState.explosions = newExplosions;

      // Update time bombs
      newGameState.timeBombs = newGameState.timeBombs.map((bomb) => ({ ...bomb, timer: bomb.timer - 1 }));
      const explodedBombs = newGameState.timeBombs.filter((bomb) => bomb.timer === 0);
      newGameState.explosions = [
        ...newGameState.explosions,
        ...explodedBombs.map((bomb) => ({ position: bomb.position })),
      ];
      newGameState.timeBombs = newGameState.timeBombs.filter((bomb) => bomb.timer > 0);

      // Check for monster-explosion collisions
      newGameState.monsters = newGameState.monsters.filter(
        (monster) => !newGameState.explosions.some((explosion) => checkTimeBombExplosion(monster, explosion)),
      );
      // Explosions destroy obstacles
      newGameState.obstacles = newGameState.obstacles.filter(
        (obstacle) => !newGameState.explosions.some((explosion) => isPositionEqual(explosion.position, obstacle)),
      );
      // Explosions destroy bonuses
      newGameState.bonuses = newGameState.bonuses.filter(
        (bonus) => !newGameState.explosions.some((explosion) => isPositionEqual(explosion.position, bonus.position)),
      );

      // Check if player is in explosion range
      if (isPlayerInExplosionRange(newGameState.playerPosition, newGameState.explosions)) {
        newGameState.isGameOver = true;
        return newGameState;
      }

      // Update active bonuses
      newGameState.activeBonuses = newGameState.activeBonuses
        .map((bonus) => ({ ...bonus, duration: bonus.duration - 1 }))
        .filter((bonus) => bonus.duration > 0);

      newGameState.builderActive = newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Builder);
      newGameState.crusherActive = newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Crusher);

      // Handle builder bonus
      if (gameState.builderActive) {
        const newObstacle = { ...oldPosition };
        if (!isPositionOccupied(newObstacle, newGameState.obstacles)) {
          newGameState.obstacles.push(newObstacle);
        }
      }
    }
  }

  return newGameState;
};

const getDirectionFromKey = (key: string): Direction | null => {
  switch (key) {
    case 'ArrowUp':
    case 'w':
      return Direction.Up;
    case 'ArrowDown':
    case 's':
      return Direction.Down;
    case 'ArrowLeft':
    case 'a':
      return Direction.Left;
    case 'ArrowRight':
    case 'd':
      return Direction.Right;
    default:
      return null;
  }
};

const getNewPosition = (currentPosition: Position, direction: Direction): Position => {
  switch (direction) {
    case Direction.Up:
      return { ...currentPosition, y: currentPosition.y - 1 };
    case Direction.Down:
      return { ...currentPosition, y: currentPosition.y + 1 };
    case Direction.Left:
      return { ...currentPosition, x: currentPosition.x - 1 };
    case Direction.Right:
      return { ...currentPosition, x: currentPosition.x + 1 };
  }
};

const isValidMove = (
  newPosition: Position,
  gameState: GameState,
  gridSize: { width: number; height: number },
): boolean => {
  return (
    newPosition.x >= 0 &&
    newPosition.x < gridSize.width &&
    newPosition.y >= 0 &&
    newPosition.y < gridSize.height &&
    !isPositionOccupied(newPosition, gameState.obstacles)
  );
};

const getRandomBonusType = (): BonusType => {
  const bonusTypes = Object.values(BonusType);
  return bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
};

export const applyBonus = (gameState: GameState, bonusType: BonusType) => {
  const newActiveBonus: ActiveBonus = { type: bonusType, duration: 13 }; // Duration set to 13 turns
  gameState.activeBonuses.push(newActiveBonus);

  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      // Logic for Cap of Invisibility is handled in monster movement
      break;
    case BonusType.ConfusedMonsters:
      // Logic for Confused Monsters is handled in monster movement
      break;
    case BonusType.LandMine:
      gameState.landMines.push({ ...gameState.playerPosition });
      break;
    case BonusType.TimeBomb:
      gameState.timeBombs.push({ position: { ...gameState.playerPosition }, timer: 13 });
      break;
    case BonusType.Crusher:
      gameState.crusherActive = true;
      break;
    case BonusType.Builder:
      gameState.builderActive = true;
      break;
  }
};

const calculateLevelScore = (gameState: GameState): number => {
  // Implement level score calculation logic here
  return 100 - gameState.steps + gameState.monsters.length * 10;
};

const getLevelConfig = (level: number): LevelConfig => {
  // Implement level configuration logic here
  return {
    gridSize: { width: 10 + level, height: 10 + level },
    initialMonsterCount: Math.max(level / 3),
    obstacleCount: 10 + level * 6,
    initialBonusCount: 1 + level,
  };
};

const spawnMonster = (gameState: GameState, gridSize: { width: number; height: number }) => {
  let monsterPosition;
  do {
    monsterPosition = generateRandomPosition(gridSize.width, gridSize.height);
  } while (
    isPositionEqual(monsterPosition, gameState.playerPosition) ||
    isPositionEqual(monsterPosition, gameState.goal) ||
    isPositionOccupied(monsterPosition, gameState.obstacles) ||
    isPositionOccupied(
      monsterPosition,
      gameState.monsters.map((m) => m.position),
    )
  );
  gameState.monsters.push({ position: monsterPosition, path: [] });
};

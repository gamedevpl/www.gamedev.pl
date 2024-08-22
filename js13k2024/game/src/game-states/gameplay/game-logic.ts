import {
  GameState,
  Position,
  LevelConfig,
  Direction,
  BonusType,
  ActiveBonus,
  BlasterShot,
  isActiveBonus,
} from './gameplay-types';
import {
  moveMonsters,
  checkCollision,
  checkLandMineCollision,
  checkTimeBombExplosion,
  isInExplosionRange,
} from './monster-logic';
import { generateLevel } from './level-generator';
import {
  BLASTER_SHOT_DURATION,
  MOVE_ANIMATION_DURATION,
  OBSTACLE_DESTRUCTION_DURATION,
} from './render/animation-utils';
import { soundEngine } from '../../sound/sound-engine';
import {
  getDirectionFromKey,
  getDirectionFromPositions,
  getNewPosition,
  isPositionEqual,
  isPositionOccupied,
  isValidMove,
  isValidObstaclePush,
  manhattanDistance,
} from './move-utils';

export const initializeGame = (level: number): [GameState, LevelConfig] => {
  const [gameState, config] = generateLevel(level);
  return [{ ...gameState, gameEndingState: 'none', tsunamiLevel: 0, isSliding: false, blasterShots: [] }, config];
};

export const handleKeyPress = (e: KeyboardEvent, gameState: GameState, levelConfig: LevelConfig): GameState => {
  if (isGameEnding(gameState)) {
    return gameState;
  }
  const direction = getDirectionFromKey(e.key);
  return direction !== null ? doGameUpdate(direction, gameState, levelConfig) : { ...gameState };
};

export const doGameUpdate = (direction: Direction, gameState: GameState, levelConfig: LevelConfig): GameState => {
  if (isGameEnding(gameState)) {
    return gameState;
  }

  const newGameState = { ...gameState };

  const oldPosition = newGameState.player.position;
  let newPosition = getNewPosition(newGameState.player.position, direction);

  // Handle Slide bonus
  if (newGameState.isSliding) {
    newPosition = handleSlideMovement(newGameState, direction, levelConfig);
  }

  // Handle Sokoban bonus
  if (newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Sokoban)) {
    handleSokobanMovement(newGameState, oldPosition, newPosition, levelConfig.gridSize);
  }

  newGameState.obstacles = gameState.obstacles.filter(
    (obstacle) => !obstacle.isDestroying || Date.now() - obstacle.creationTime < OBSTACLE_DESTRUCTION_DURATION,
  );

  if (
    isActiveBonus(newGameState, BonusType.Crusher) &&
    gameState.obstacles.find((obstacle) => isPositionEqual(newPosition, obstacle.position))
  ) {
    newGameState.obstacles = gameState.obstacles.map((obstacle) =>
      isPositionEqual(newPosition, obstacle.position)
        ? { ...obstacle, isDestroying: true, creationTime: Date.now() }
        : obstacle,
    );
    soundEngine.playElectricalDischarge();
  }

  if (isValidMove(newPosition, newGameState, levelConfig)) {
    soundEngine.playStep();
    newGameState.player.position = newPosition;
    if (Date.now() - newGameState.player.moveTimestamp > MOVE_ANIMATION_DURATION) {
      newGameState.player.previousPosition = oldPosition;
      newGameState.player.moveTimestamp = Date.now();
    }
    newGameState.steps++;
    newGameState.monsterSpawnSteps++;

    // Handle Tsunami bonus
    if (newGameState.tsunamiLevel > 0) {
      handleTsunamiEffect(newGameState);
    }

    // Check for goal
    if (isPositionEqual(newPosition, newGameState.goal)) {
      newGameState.gameEndingState = 'levelComplete';
      startLevelCompleteAnimation(newGameState);
      newGameState.score += calculateLevelScore(newGameState);
      return newGameState;
    }

    // Check for bonuses
    const collectedBonus = newGameState.bonuses.find((bonus) => isPositionEqual(bonus.position, newPosition));
    if (collectedBonus) {
      soundEngine.playBonusCollected();
      newGameState.bonuses = newGameState.bonuses.filter((bonus) => !isPositionEqual(bonus.position, newPosition));
      applyBonus(newGameState, collectedBonus.type);
    }

    // Check for teleport points
    if (collectedBonus?.type === BonusType.Teleport) {
      performTeleportation(newGameState, collectedBonus.position);
    }

    // Spawn monster every 13th step
    if (newGameState.monsterSpawnSteps >= 13) {
      spawnMonster(newGameState, levelConfig);
      newGameState.monsterSpawnSteps = 0;
      soundEngine.playMonsterSpawn();
    }

    // Move monsters
    newGameState.monsters = moveMonsters(
      newGameState.monsters,
      newGameState.player.position,
      levelConfig.gridSize,
      newGameState.obstacles,
      isActiveBonus(newGameState, BonusType.CapOfInvisibility),
      isActiveBonus(newGameState, BonusType.ConfusedMonsters),
      isActiveBonus(newGameState, BonusType.Monster),
    );

    // Handle Monster bonus
    if (isActiveBonus(newGameState, BonusType.Monster)) {
      handleMonsterBonus(newGameState);
    } else {
      // Check for collisions with monsters
      if (checkCollision(newGameState.player.position, newGameState.monsters)) {
        newGameState.gameEndingState = 'gameOver';
        startGameOverAnimation(newGameState);
        return newGameState;
      }
    }

    // Handle Blaster bonus
    if (isActiveBonus(newGameState, BonusType.Blaster)) {
      handleBlasterShot(newGameState, direction, levelConfig);
    }
    newGameState.blasterShots = newGameState.blasterShots.filter(
      (shot) => Date.now() - shot.shotTimestamp < shot.duration,
    );

    // Check for land mine collisions
    const [newMonsters, newExplosions] = checkLandMineCollision(newGameState.monsters, newGameState.landMines);

    newGameState.monsters = newMonsters;
    newGameState.explosions = newExplosions;

    // Update time bombs
    newGameState.timeBombs = newGameState.timeBombs.map((bomb) => ({ ...bomb, timer: bomb.timer - 1 }));
    const explodedBombs = newGameState.timeBombs.filter((bomb) => bomb.timer === 0);
    if (explodedBombs.length > 0 || newExplosions.length > 0) {
      soundEngine.playExplosion();
    }
    newGameState.explosions = [
      ...newGameState.explosions,
      ...explodedBombs.map((bomb) => ({ position: bomb.position, startTime: Date.now(), duration: 1000 })),
    ];
    newGameState.timeBombs = newGameState.timeBombs.filter((bomb) => bomb.timer > 0);

    // Check for monster-explosion collisions
    newGameState.monsters = newGameState.monsters.filter(
      (monster) => !newGameState.explosions.some((explosion) => checkTimeBombExplosion(monster, explosion)),
    );
    // Explosions destroy obstacles
    newGameState.obstacles = newGameState.obstacles.map((obstacle) =>
      isInExplosionRange(obstacle.position, newGameState.explosions)
        ? { ...obstacle, isDestroying: true, creationTime: Date.now() }
        : obstacle,
    );
    // Explosions destroy bonuses
    newGameState.bonuses = newGameState.bonuses.filter(
      (bonus) => !isInExplosionRange(bonus.position, newGameState.explosions),
    );

    // Check if player is in explosion range
    if (isInExplosionRange(newGameState.player.position, newGameState.explosions)) {
      newGameState.gameEndingState = 'gameOver';
      startGameOverAnimation(newGameState);
      return newGameState;
    }

    // Update active bonuses
    newGameState.activeBonuses = newGameState.activeBonuses
      .map((bonus) => ({ ...bonus, duration: bonus.duration - 1 }))
      .filter((bonus) => bonus.duration > 0);

    // Handle builder bonus
    if (isActiveBonus(newGameState, BonusType.Builder)) {
      const newObstacle = { position: oldPosition, creationTime: Date.now(), isRaising: true, isDestroying: false };
      if (
        !isPositionOccupied(
          newObstacle.position,
          newGameState.obstacles.map(({ position }) => position),
        )
      ) {
        newGameState.obstacles.push(newObstacle);
        soundEngine.playElectricalDischarge();
      }
    }
  }

  return newGameState;
};

export const applyBonus = (gameState: GameState, bonusType: BonusType) => {
  const newActiveBonus: ActiveBonus = { type: bonusType, duration: 13 };
  gameState.activeBonuses.push(newActiveBonus);

  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      // Logic for Cap of Invisibility is handled in monster movement
      break;
    case BonusType.ConfusedMonsters:
      // Logic for Confused Monsters is handled in monster movement
      break;
    case BonusType.LandMine:
      gameState.landMines.push({ ...gameState.player.position });
      break;
    case BonusType.TimeBomb:
      gameState.timeBombs.push({
        position: gameState.player.position,
        timer: 13,
        shakeIntensity: 0,
      });
      break;
    case BonusType.Crusher:
      break;
    case BonusType.Builder:
      break;
    case BonusType.Climber:
      break;
    case BonusType.Teleport:
      // Teleport is handled immediately when collected
      break;
    case BonusType.Tsunami:
      gameState.tsunamiLevel = 1;
      break;
    case BonusType.Monster:
      break;
    case BonusType.Slide:
      gameState.isSliding = true;
      break;
    case BonusType.Sokoban:
      break;
    case BonusType.Blaster:
      break;
  }
};

const calculateLevelScore = (gameState: GameState): number => {
  return 100 - gameState.steps + gameState.monsters.length * 10;
};

const spawnMonster = (gameState: GameState, { gridSize }: LevelConfig) => {
  let monsterPosition;
  do {
    monsterPosition = generateRandomPosition(gridSize, gridSize);
  } while (
    isPositionEqual(monsterPosition, gameState.player.position) ||
    isPositionEqual(monsterPosition, gameState.goal) ||
    isPositionOccupied(
      monsterPosition,
      gameState.obstacles.filter((obstacle) => !obstacle.isDestroying).map(({ position }) => position),
    ) ||
    isPositionOccupied(
      monsterPosition,
      gameState.monsters.map((m) => m.position),
    )
  );
  gameState.monsters.push({
    position: monsterPosition,
    previousPosition: monsterPosition,
    moveTimestamp: Date.now(),
    path: [],
    seed: Math.random(),
    isConfused: false,
  });
};

const generateRandomPosition = (width: number, height: number): Position => ({
  x: Math.floor(Math.random() * width),
  y: Math.floor(Math.random() * height),
});

export const isGameEnding = (gameState: GameState): boolean => {
  return gameState.gameEndingState !== 'none';
};

export const startGameOverAnimation = (gameState: GameState): void => {
  gameState.player.isVanishing = true;
  soundEngine.playGameOver();
};

export const startLevelCompleteAnimation = (gameState: GameState): void => {
  gameState.player.isVictorious = true;
  soundEngine.playLevelComplete();
};

const performTeleportation = (gameState: GameState, teleportPoint: Position): void => {
  const destinationPoint = gameState.bonuses.find(
    (bonus) => bonus.type === BonusType.Teleport && !isPositionEqual(bonus.position, teleportPoint),
  );
  if (destinationPoint) {
    gameState.player.previousPosition = gameState.player.position;
    gameState.player.position = destinationPoint.position;
    gameState.player.teleportTimestamp = Date.now();
    soundEngine.playTeleport();
  }
};

const handleTsunamiEffect = (gameState: GameState): void => {
  gameState.tsunamiLevel++;
  if (gameState.tsunamiLevel >= 13) {
    if (!isActiveBonus(gameState, BonusType.Climber)) {
      gameState.gameEndingState = 'gameOver';
      startGameOverAnimation(gameState);
    }
    gameState.monsters = [];
    gameState.tsunamiLevel = 0;
  }
};

const handleMonsterBonus = (gameState: GameState): void => {
  // Check for collisions with monsters (now players)
  const collidedMonster = gameState.monsters.find((monster) =>
    isPositionEqual(gameState.player.position, monster.position),
  );
  if (collidedMonster) {
    gameState.monsters = gameState.monsters.filter((monster) => monster !== collidedMonster);
    if (gameState.monsters.length === 0) {
      gameState.gameEndingState = 'gameOver';
      startGameOverAnimation(gameState);
    }
  }
};

const handleSlideMovement = (gameState: GameState, direction: Direction, levelConfig: LevelConfig): Position => {
  let newPosition = gameState.player.position;
  while (isValidMove(getNewPosition(newPosition, direction), gameState, levelConfig)) {
    newPosition = getNewPosition(newPosition, direction);
  }
  return newPosition;
};

const handleSokobanMovement = (
  gameState: GameState,
  oldPosition: Position,
  newPosition: Position,
  gridSize: number,
): void => {
  const pushedObstacle = gameState.obstacles.find((obstacle) => isPositionEqual(obstacle.position, newPosition));
  if (pushedObstacle) {
    const obstacleNewPosition = getNewPosition(
      pushedObstacle.position,
      getDirectionFromPositions(oldPosition, newPosition),
    );
    if (isValidObstaclePush(obstacleNewPosition, gameState, { gridSize })) {
      pushedObstacle.position = obstacleNewPosition;
      // Check if the pushed obstacle crushes a monster
      const crushedMonster = gameState.monsters.find((monster) =>
        isPositionEqual(monster.position, obstacleNewPosition),
      );
      if (crushedMonster) {
        gameState.monsters = gameState.monsters.filter((monster) => monster !== crushedMonster);
      }
    } else {
      // If the obstacle can't be pushed, the player doesn't move
      newPosition = oldPosition;
    }
  }
};

const handleBlasterShot = (gameState: GameState, direction: Direction, levelConfig: LevelConfig): void => {
  const start = gameState.player.position;
  const end = handleSlideMovement(gameState, direction, levelConfig);
  const shot: BlasterShot = {
    startPosition: start,
    endPosition: end,
    direction: direction,
    shotTimestamp: Date.now(),
    duration: BLASTER_SHOT_DURATION * (manhattanDistance(start, end) + 1),
  };
  gameState.blasterShots.push(shot);
  // Play the blaster sound effect
  soundEngine.playBlasterSound();

  // Check if the shot hits monsters along its path
  gameState.monsters = gameState.monsters.filter((monster) => {
    const isHit = isMonsterOnBlasterPath(monster.position, start, end, direction);
    return !isHit;
  });
};

const isMonsterOnBlasterPath = (
  monsterPos: Position,
  start: Position,
  end: Position,
  direction: Direction,
): boolean => {
  switch (direction) {
    case Direction.Up:
    case Direction.Down:
      return (
        monsterPos.x === start.x &&
        ((direction === Direction.Up && monsterPos.y <= start.y && monsterPos.y >= end.y) ||
          (direction === Direction.Down && monsterPos.y >= start.y && monsterPos.y <= end.y))
      );
    case Direction.Left:
    case Direction.Right:
      return (
        monsterPos.y === start.y &&
        ((direction === Direction.Left && monsterPos.x <= start.x && monsterPos.x >= end.x) ||
          (direction === Direction.Right && monsterPos.x >= start.x && monsterPos.x <= end.x))
      );
  }
};

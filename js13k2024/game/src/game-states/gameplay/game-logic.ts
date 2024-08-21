import { GameState, Position, LevelConfig, Direction, BonusType, ActiveBonus } from './gameplay-types';
import {
  moveMonsters,
  checkCollision,
  checkLandMineCollision,
  checkTimeBombExplosion,
  isInExplosionRange,
} from './monster-logic';
import { generateLevel } from './level-generator';
import { MOVE_ANIMATION_DURATION, OBSTACLE_DESTRUCTION_DURATION } from './animation-utils';
import { soundEngine } from '../../sound/sound-engine';
import { getDirectionFromKey, getNewPosition, isPositionEqual, isPositionOccupied, isValidMove } from './move-utils';

export const initializeGame = (level: number): [GameState, LevelConfig] => {
  const [gameState, config] = generateLevel(level);
  return [{ ...gameState, gameEndingState: 'none' }, config];
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
  const newPosition = getNewPosition(newGameState.player.position, direction);

  newGameState.obstacles = gameState.obstacles.filter(
    (obstacle) => !obstacle.isDestroying || Date.now() - obstacle.creationTime < OBSTACLE_DESTRUCTION_DURATION,
  );

  if (
    gameState.crusherActive &&
    gameState.obstacles.find((obstacle) => isPositionEqual(newPosition, obstacle.position))
  ) {
    newGameState.obstacles = gameState.obstacles.map((obstacle) =>
      isPositionEqual(newPosition, obstacle.position)
        ? { ...obstacle, isDestroying: true, creationTime: Date.now() }
        : obstacle,
    );
    soundEngine.playElectricalDischarge(); // Play sound for crusher destroying obstacle
  }

  if (isValidMove(newPosition, newGameState, levelConfig)) {
    soundEngine.playStep(); // Play step sound
    newGameState.player.position = newPosition;
    if (Date.now() - newGameState.player.moveTimestamp > MOVE_ANIMATION_DURATION) {
      newGameState.player.previousPosition = oldPosition;
      newGameState.player.moveTimestamp = Date.now();
    }
    newGameState.steps++;
    newGameState.monsterSpawnSteps++;

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
      newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
      newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.ConfusedMonsters),
    );

    // Check for collisions with monsters
    if (checkCollision(newGameState.player.position, newGameState.monsters)) {
      newGameState.gameEndingState = 'gameOver';
      startGameOverAnimation(newGameState);
      return newGameState;
    }

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

    newGameState.builderActive = newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Builder);
    newGameState.crusherActive = newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Crusher);
    newGameState.player.isClimbing = newGameState.activeBonuses.some((bonus) => bonus.type === BonusType.Climber);

    // Handle builder bonus
    if (gameState.builderActive) {
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
      gameState.crusherActive = true;
      break;
    case BonusType.Builder:
      gameState.builderActive = true;
      break;
    case BonusType.Climber:
      gameState.player.isClimbing = true;
      break;
    case BonusType.Teleport:
      // Teleport is handled immediately when collected
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

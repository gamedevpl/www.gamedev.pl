import { GameState, LevelConfig, Direction, BonusType, isActiveBonus } from './gameplay-types';
import {
  moveMonsters,
  checkCollision,
  checkLandMineCollision,
  checkTimeBombExplosion,
  isInExplosionRange,
} from './monster-logic';
import { generateLevel } from './level-generator';
import { MOVE_ANIMATION_DURATION, OBSTACLE_DESTRUCTION_DURATION } from './render/animation-utils';
import { soundEngine } from '../../sound/sound-engine';
import { getDirectionFromKey, getNewPosition, isPositionEqual, isPositionOccupied, isValidMove } from './move-utils';
import {
  applyBonus,
  handleBlasterShot,
  handleMonsterBonus,
  handleSlideMovement,
  handleSokobanMovement,
  handleTsunamiEffect,
  performTeleportation,
} from './bonus-logic';

export const initializeGame = (level: number): [GameState, LevelConfig] => {
  const [gameState, config] = generateLevel(level);
  return [{ ...gameState, gameEndingState: 'none', tsunamiLevel: 0, blasterShots: [] }, config];
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
  if (isActiveBonus(newGameState, BonusType.Slide)) {
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

    // spawn bonuses, monsters, and do other updates according to current game situation
    levelConfig.levelUpdater(newGameState, levelConfig);

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

const calculateLevelScore = (gameState: GameState): number => {
  return 100 - gameState.steps + gameState.monsters.length * 10;
};

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

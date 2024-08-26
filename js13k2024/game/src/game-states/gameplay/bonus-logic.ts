import { playEffect, SoundEffect } from '../../sound/sound-engine';
import { startGameOverAnimation } from './game-logic';
import { GameState, BonusType, ActiveBonus, LevelConfig, Position, Direction, BlasterShot } from './gameplay-types';
import {
  isPositionOccupied,
  isPositionEqual,
  manhattanDistance,
  getNewPosition,
  isValidMove,
  getDirectionFromPositions,
  isValidObstaclePush,
} from './move-utils';
import { BLASTER_SHOT_DURATION } from './render/animation-utils';

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
      break;
    case BonusType.Sokoban:
      break;
    case BonusType.Blaster:
      break;
  }
};

export const spawnDynamicBonus = (gameState: GameState, levelConfig: LevelConfig): void => {
  const availableBonusTypes = Object.values(BonusType).filter((type) => typeof type === 'number') as BonusType[];
  let selectedBonusType: BonusType;

  // Analyze the game state to determine the most appropriate bonus
  if (gameState.monsters.length > 5) {
    // If there are many monsters, prioritize defensive bonuses
    const defensiveBonuses = [
      BonusType.CapOfInvisibility,
      BonusType.Crusher,
      BonusType.LandMine,
      BonusType.TimeBomb,
      BonusType.Blaster,
    ];
    selectedBonusType = defensiveBonuses[Math.floor(Math.random() * defensiveBonuses.length)];
  } else if (gameState.obstacles.length > 20) {
    // If there are many obstacles, prioritize movement-related bonuses
    const movementBonuses = [BonusType.Climber, BonusType.Slide, BonusType.Teleport];
    selectedBonusType = movementBonuses[Math.floor(Math.random() * movementBonuses.length)];
  } else {
    // Otherwise, choose a random bonus type
    selectedBonusType = availableBonusTypes[Math.floor(Math.random() * availableBonusTypes.length)];
  }

  // Find a valid position for the new bonus
  let position: Position;
  do {
    position = {
      x: Math.floor(Math.random() * levelConfig.gridSize),
      y: Math.floor(Math.random() * levelConfig.gridSize),
    };
  } while (
    isPositionOccupied(
      position,
      gameState.obstacles.map((o) => o.position),
    ) ||
    isPositionOccupied(
      position,
      gameState.monsters.map((m) => m.position),
    ) ||
    isPositionOccupied(
      position,
      gameState.bonuses.map((b) => b.position),
    ) ||
    isPositionEqual(position, gameState.player.position) ||
    isPositionEqual(position, gameState.goal) ||
    manhattanDistance(position, gameState.player.position) < 3
  );

  // Add the new bonus to the game state
  gameState.bonuses.push({
    type: selectedBonusType,
    position: position,
  });
};

export const performTeleportation = (gameState: GameState, teleportPoint: Position): void => {
  const destinationPoint = gameState.bonuses.find(
    (bonus) => bonus.type === BonusType.Teleport && !isPositionEqual(bonus.position, teleportPoint),
  );
  if (destinationPoint) {
    gameState.player.previousPosition = gameState.player.position;
    gameState.player.position = destinationPoint.position;
    gameState.player.teleportTimestamp = Date.now();
    playEffect(SoundEffect.Teleport);
  }
};

export const handleTsunamiEffect = (gameState: GameState): void => {
  gameState.tsunamiLevel++;
  if (gameState.tsunamiLevel >= 13) {
    if (
      // player must be standing on a obstacle
      !isPositionOccupied(
        gameState.player.position,
        gameState.obstacles.map((o) => o.position),
      )
    ) {
      gameState.gameEndingState = 'gameOver';
      startGameOverAnimation(gameState);
    }
    gameState.monsters = [];
    gameState.tsunamiLevel = 0;
    gameState.tsunamiTeardownTimestamp = Date.now();
  }
};

export const handleMonsterBonus = (gameState: GameState): void => {
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

export const handleSlideMovement = (gameState: GameState, direction: Direction, levelConfig: LevelConfig): Position => {
  let newPosition = gameState.player.position;
  while (isValidMove(getNewPosition(newPosition, direction), gameState, levelConfig)) {
    newPosition = getNewPosition(newPosition, direction);
  }
  return newPosition;
};

export const handleSokobanMovement = (
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

export const handleBlasterShot = (gameState: GameState, direction: Direction, levelConfig: LevelConfig): void => {
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
  playEffect(SoundEffect.BlasterSound);

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
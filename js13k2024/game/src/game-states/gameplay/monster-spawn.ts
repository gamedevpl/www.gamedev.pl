import { GameState, Monster, Position, BonusType, LevelConfig } from './gameplay-types';
import { isPositionOccupied, isPositionEqual, manhattanDistance } from './move-utils';

const MIN_SPAWN_DISTANCE_FROM_PLAYER = 10;
const MIN_SPAWN_DISTANCE_FROM_BONUS = 10;

export const spawnMonster = (gameState: GameState, { gridSize, monsterSpawnSectors }: LevelConfig): Monster | null => {
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    const position =
      monsterSpawnSectors.length > 0
        ? monsterSpawnSectors[Math.round(monsterSpawnSectors.length * Math.random())]
        : {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize),
          };

    if (isValidSpawnPosition(position, gameState, gridSize)) {
      return {
        position,
        previousPosition: position,
        moveTimestamp: Date.now(),
        path: [],
        seed: Math.random(),
        isConfused: false,
        spawnPoint: position,
      };
    }

    attempts++;
  }

  return null; // Failed to spawn a monster after max attempts
};

const isValidSpawnPosition = (position: Position, gameState: GameState, gridSize: number): boolean => {
  if (position.x < 0 || position.y < 0 || position.x >= gridSize || position.y >= gridSize) {
    return false;
  }

  // Check if the position is occupied by obstacles, other monsters, or bonuses
  if (
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
    isPositionEqual(position, gameState.goal)
  ) {
    return false;
  }

  // Check distance from player
  if (manhattanDistance(position, gameState.player.position) < MIN_SPAWN_DISTANCE_FROM_PLAYER) {
    return false;
  }

  // Check distance from critical bonuses
  const criticalBonusTypes = [BonusType.TimeBomb, BonusType.LandMine, BonusType.Crusher, BonusType.Blaster];
  for (const bonus of gameState.bonuses) {
    if (
      criticalBonusTypes.includes(bonus.type) &&
      manhattanDistance(position, bonus.position) < MIN_SPAWN_DISTANCE_FROM_BONUS
    ) {
      return false;
    }
  }

  return true;
};

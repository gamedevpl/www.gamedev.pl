import { GameState, LevelConfig, BonusType, Position } from '../gameplay-types';
import {
  createPosition,
  createMonster,
  createObstacle,
  createPlayer,
  createBonus,
  generateBaseState,
  generateBaseConfig,
} from '../level-generator';

const GRID_SIZE = 16;
const MIN_DISTANCE_FROM_PLAYER = 5;

function getRandomPosition(): Position {
  return {
    x: Math.floor(Math.random() * GRID_SIZE),
    y: Math.floor(Math.random() * GRID_SIZE),
  };
}

function distanceBetween(pos1: Position, pos2: Position): number {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

function isPositionValid(pos: Position, state: GameState): boolean {
  return (
    !state.obstacles.some((obs) => obs.position.x === pos.x && obs.position.y === pos.y) &&
    !state.monsters.some((monster) => monster.position.x === pos.x && monster.position.y === pos.y) &&
    !state.bonuses.some((bonus) => bonus.position.x === pos.x && bonus.position.y === pos.y) &&
    pos.x !== state.player.position.x &&
    pos.y !== state.player.position.y &&
    pos.x !== state.goal.x &&
    pos.y !== state.goal.y
  );
}

function spawnObstacles(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    let pos;
    do {
      pos = getRandomPosition();
    } while (!isPositionValid(pos, state));
    state.obstacles.push(createObstacle(pos.x, pos.y));
  }
}

function spawnBonus(state: GameState): void {
  const bonusTypes = Object.values(BonusType).filter((v) => typeof v === 'number') as BonusType[];
  const randomBonusType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
  let pos;
  do {
    pos = getRandomPosition();
  } while (!isPositionValid(pos, state) || distanceBetween(pos, state.player.position) < MIN_DISTANCE_FROM_PLAYER);
  state.bonuses.push(createBonus(pos.x, pos.y, randomBonusType));
}

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(
    GRID_SIZE,
    'The Final Countdown',
    'Survive and thrive in this ever-changing challenge!',
    updateDynamicLevel,
  );

  state.player = createPlayer(0, 0);
  state.goal = createPosition(GRID_SIZE - 1, GRID_SIZE - 1);
  state.obstacles = [
    createObstacle(GRID_SIZE - 2, GRID_SIZE - 2),
    createObstacle(GRID_SIZE - 1, GRID_SIZE - 2),
    createObstacle(GRID_SIZE - 2, GRID_SIZE - 1),
  ];

  // Initial setup
  spawnObstacles(state, 50);
  for (let i = 0; i < 3; i++) {
    spawnBonus(state);
  }

  return [
    state,
    config,
    'Welcome to the ultimate challenge! The level will dynamically evolve as you play. Use your skills wisely, collect bonuses, and make your way to the goal while avoiding the increasing dangers. Good luck!',
  ];
};

// This function should be called from the main game loop to update the level
const updateDynamicLevel = (state: GameState): void => {
  // Spawn a new monster every 13 steps
  if (state.steps % 13 === 0) {
    let pos;
    do {
      pos = getRandomPosition();
    } while (!isPositionValid(pos, state) || distanceBetween(pos, state.player.position) < MIN_DISTANCE_FROM_PLAYER);
    state.monsters.push(createMonster(pos.x, pos.y));

    // Spawn a new bonus alongside the monster
    spawnBonus(state);
  }

  // Occasionally add new obstacles
  if (state.steps % 50 === 0) {
    spawnObstacles(state, 1);
  }

  // Ensure there are always at least 3 bonuses on the board
  while (state.bonuses.length < 3) {
    spawnBonus(state);
  }
};

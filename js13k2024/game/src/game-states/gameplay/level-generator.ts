import { GameState, LevelConfig, Position, Monster, Player, BonusType, Obstacle } from './gameplay-types';

import { generateLevel as generateLevel1 } from './levels/01-the-first-step';
import { generateLevel as generateLevel2 } from './levels/02-now-you-see-me';
import { generateLevel as generateLevel3 } from './levels/03-bridge-the-gap';
import { generateLevel as generateLevel4 } from './levels/04-crush-and-rush';
import { generateLevel as generateLevel5 } from './levels/05-tick-tock-boom';
import { generateLevel as generateLevel6 } from './levels/06-minesweepers-revenge';
import { generateLevel as generateLevel7 } from './levels/07-monsters-mayhem';
import { generateLevel as generateLevel8 } from './levels/08-tunnel-vision';
import { generateLevel as generateLevel9 } from './levels/09-ghost-bomber';
import { generateLevel as generateLevel10 } from './levels/10-crush-confuse-conquer';
import { generateLevel as generateLevel11 } from './levels/11-the-triple-threat';
import { generateLevel as generateLevel12 } from './levels/12-the-gauntlet';
import { generateLevel as generateLevel13 } from './levels/13-the-final-countdown';

const createPosition = (x: number, y: number): Position => ({ x, y });

const createBonus = (x: number, y: number, type: BonusType) => ({
  position: createPosition(x, y),
  type,
});

const createMonster = (x: number, y: number): Monster => ({
  position: createPosition(x, y),
  previousPosition: createPosition(x, y),
  moveTimestamp: Date.now(),
  path: [],
  seed: Math.random(),
  isConfused: false,
});

const createPlayer = (x: number, y: number): Player => ({
  position: createPosition(x, y),
  previousPosition: createPosition(x, y),
  moveTimestamp: Date.now(),
  isInvisible: false,
  isVictorious: false,
  isVanishing: false,
  isClimbing: false,
});

const createObstacle = (x: number, y: number): Obstacle => ({
  position: createPosition(x, y),
  creationTime: Date.now(),
  isRaising: false,
  isDestroying: false,
});

const generateBaseState = (): GameState => ({
  player: createPlayer(0, 0),
  goal: createPosition(0, 0),
  obstacles: [],
  monsters: [],
  steps: 0,
  monsterSpawnSteps: 0,
  bonuses: [],
  activeBonuses: [],
  explosions: [],
  timeBombs: [],
  landMines: [],
  crusherActive: false,
  builderActive: false,
  score: 0,
  gameEndingState: 'none',
});

const CELL_SIZE = 40;

const generateBaseConfig = (gridSize: number, levelName: string, levelStory: string): LevelConfig => ({
  gridSize,
  cellSize: CELL_SIZE,
  initialMonsterCount: 0,
  obstacleCount: 0,
  initialBonusCount: 0,
  levelName,
  levelStory,
});

const levels: { [key: number]: () => [GameState, LevelConfig, string] } = {
  1: generateLevel1,
  2: generateLevel2,
  3: generateLevel3,
  4: generateLevel4,
  5: generateLevel5,
  6: generateLevel6,
  7: generateLevel7,
  8: generateLevel8,
  9: generateLevel9,
  10: generateLevel10,
  11: generateLevel11,
  12: generateLevel12,
  13: generateLevel13,
};

export const generateLevel = (level: number): [GameState, LevelConfig, string] => {
  if (level < 1 || level > 13) {
    throw new Error(`Invalid level number: ${level}`);
  }
  return levels[level]();
};

export {
  createPosition,
  createBonus,
  createMonster,
  createPlayer,
  createObstacle,
  generateBaseState,
  generateBaseConfig,
};

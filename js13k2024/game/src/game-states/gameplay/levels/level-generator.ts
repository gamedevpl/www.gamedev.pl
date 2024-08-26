import { GameState, LevelConfig, Position, Monster, Player, BonusType, Obstacle } from '../gameplay-types';
import { simpleLevelUpdater } from './level-updater';
import { getLevelData } from './level-data';

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
  spawnPoint: createPosition(x, y),
});

const createPlayer = (x: number, y: number): Player => ({
  position: createPosition(x, y),
  previousPosition: createPosition(x, y),
  moveTimestamp: Date.now(),
  isVictorious: false,
  isVanishing: false,
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
  score: 0,
  gameEndingState: 'none',
  tsunamiLevel: 0,
  blasterShots: [],
});

const CELL_SIZE = 40;

const generateBaseConfig = (
  gridSize: number,
  levelNumber: number,
  levelName: string,
  levelStory: string,
  levelUpdater = simpleLevelUpdater,
): LevelConfig => ({
  gridSize,
  cellSize: CELL_SIZE,
  initialMonsterCount: 0,
  monsterSpawnSectors: [],
  obstacleCount: 0,
  initialBonusCount: 0,
  levelNumber,
  levelName,
  levelStory,
  levelUpdater,
});

const levels: Array<() => [GameState, LevelConfig, string]> = Array.from({ length: 13 }).map((_value, idx) => () => {
  const [
    [
      [gridSizeX, gridSizeY],
      [playerX, playerY],
      [goalX, goalY],
      monsters,
      obstacles,
      bonuses,
      monsterSpawnSectors,
      levelName,
      levelStory,
    ],
    updater,
  ] = getLevelData(idx + 1);

  const gameState: GameState = generateBaseState();
  gameState.player = createPlayer(playerX, playerY);
  gameState.goal = createPosition(goalX, goalY);
  gameState.monsters = monsters.map(([x, y]) => createMonster(x, y));
  gameState.obstacles = obstacles.map(([x, y]) => createObstacle(x, y));
  gameState.bonuses = bonuses.map(([x, y, type]) => createBonus(x, y, type as BonusType));

  const levelConfig: LevelConfig = generateBaseConfig(
    Math.max(gridSizeX, gridSizeY),
    idx + 1,
    levelName,
    levelStory,
    updater,
  );
  levelConfig.initialMonsterCount = monsters.length;
  levelConfig.monsterSpawnSectors = monsterSpawnSectors.map(([x, y]) => createPosition(x, y));
  levelConfig.obstacleCount = obstacles.length;
  levelConfig.initialBonusCount = bonuses.length;

  return [gameState, levelConfig, levelStory];
});

export const generateLevel = (level: number): [GameState, LevelConfig, string] => {
  if (level < 1 || level > 13) {
    throw new Error(`Invalid level number: ${level}`);
  }
  return levels[level - 1]();
};

export { createMonster };

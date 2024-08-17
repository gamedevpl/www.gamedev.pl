export interface Position {
  x: number;
  y: number;
}

export interface Monster {
  position: Position;
  path: Position[];
}

export enum BonusType {
  CapOfInvisibility = 'CapOfInvisibility',
  ConfusedMonsters = 'ConfusedMonsters',
  LandMine = 'LandMine',
  TimeBomb = 'TimeBomb',
  Crusher = 'Crusher',
  Builder = 'Builder',
}

export interface Bonus {
  type: BonusType;
  position: Position;
}

export interface GameState {
  playerPosition: Position;
  goal: Position;
  obstacles: Position[];
  monsters: Monster[];
  steps: number;
  monsterSpawnSteps: number;
  bonuses: Bonus[];
  activeBonuses: ActiveBonus[];
  explosions: Explosion[];
  timeBombs: TimeBomb[];
  landMines: Position[];
  crusherActive: boolean;
  builderActive: boolean;
  score: number;
  isLevelComplete: boolean;
  isGameOver: boolean;
}

export type Explosion = {
  position: Position;
};

export type TimeBomb = { position: Position; timer: number };

export type ActiveBonus = {
  type: BonusType;
  duration: number;
};

export enum Direction {
  Up,
  Down,
  Left,
  Right,
}

export interface GridSize {
  width: number;
  height: number;
}

export interface LevelConfig {
  gridSize: GridSize;
  initialMonsterCount: number;
  obstacleCount: number;
  initialBonusCount: number;
  levelName: string; // New property for level name
  levelStory: string; // New property for level story
}

export interface Score {
  points: number;
  steps: number;
  timeBonus: number;
}

export interface PowerUp {
  type: 'StepEraser' | 'MonsterFreeze' | 'Teleport';
  position: Position;
}

export interface GameplayProps {
  level: number;
  score: number;
  onGameOver: () => void;
  onLevelComplete: () => void;
  onGameComplete: () => void; // New property for game completion
  updateScore: (newScore: number) => void;
  updateSteps: (newSteps: number) => void;
}

export interface PathfindingNode {
  position: Position;
  g: number;
  h: number;
  f: number;
  parent: PathfindingNode | null;
}

export interface GameConfig {
  cellSize: number;
  monsterSpawnInterval: number;
  baseGridSize: GridSize;
  maxGridSize: GridSize;
  baseObstacleCount: number;
  maxObstacleCount: number;
  levelIncreaseFactor: number;
  bonusDuration: number;
  maxLevel: number; // New property for maximum level
}

// New type for level generation function
export type LevelGeneratorFunction = () => [GameState, LevelConfig, string];

// New interface for level data
export interface LevelData {
  gameState: GameState;
  levelConfig: LevelConfig;
  story: string;
}

// New function to get human-readable and fun descriptions for BonusType
export function getBonusDescription(bonusType: BonusType): string {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return "Now you see me, now you don't!";
    case BonusType.ConfusedMonsters:
      return 'Monsters are dizzy!';
    case BonusType.LandMine:
      return 'Boom goes the floor!';
    case BonusType.TimeBomb:
      return "Tick tock, boom o'clock!";
    case BonusType.Crusher:
      return 'Hulk smash!';
    case BonusType.Builder:
      return 'Bob the Builder mode: ON';
    default:
      return 'Mystery power activated!';
  }
}

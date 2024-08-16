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
  monsterSpawnSteps: number; // New property to track steps for monster spawning
  bonuses: Bonus[];
  activeBonuses: ActiveBonus[];
  explosions: Explosion[];
  timeBombs: { position: Position; timer: number }[];
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
}

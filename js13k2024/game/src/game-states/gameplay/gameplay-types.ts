export interface Position {
  x: number;
  y: number;
}

export interface Monster {
  position: Position;
  previousPosition: Position;
  moveTimestamp: number;
  path: Position[];
  seed: number; // New property for randomizing tentacle animations
  isConfused: boolean; // New property for confused state animation
}

export enum BonusType {
  CapOfInvisibility,
  ConfusedMonsters,
  LandMine,
  TimeBomb,
  Crusher,
  Builder,
}

export interface Bonus {
  type: BonusType;
  position: Position;
}

export interface Player {
  position: Position;
  previousPosition: Position;
  moveTimestamp: number;
  isInvisible: boolean; // New property for invisibility animation
  isVictorious: boolean; // New property for victory animation
}

export interface Obstacle {
  position: Position;
  creationTime: number; // New property for creation/destruction animation
  isRaising: boolean; // New property to determine if the obstacle is raising or collapsing
}

export interface GameState {
  player: Player;
  goal: Position;
  obstacles: Obstacle[];
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
  startTime: number; // New property for explosion animation timing
  duration: number; // New property for explosion animation duration
};

export type TimeBomb = {
  position: Position;
  timer: number;
  shakeIntensity: number; // New property for bomb shaking animation
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
  levelName: string;
  levelStory: string;
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
  onGameComplete: () => void;
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
  maxLevel: number;
}

export type LevelGeneratorFunction = () => [GameState, LevelConfig, string];

export interface LevelData {
  gameState: GameState;
  levelConfig: LevelConfig;
  story: string;
}

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

// New interfaces for animation effects
export interface ScreenShake {
  intensity: number;
  duration: number;
}

export interface ElectricalDischarge {
  position: Position;
  intensity: number;
  duration: number;
}

export interface EntityAnimationState {
  bounceOffset: number;
  tentacleAnimationFactor: number;
}

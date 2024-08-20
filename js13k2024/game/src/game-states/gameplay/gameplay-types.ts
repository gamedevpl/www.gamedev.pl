export interface Position {
  x: number;
  y: number;
}

export interface Monster {
  position: Position;
  previousPosition: Position;
  moveTimestamp: number;
  path: Position[];
  seed: number;
  isConfused: boolean;
}

export enum BonusType {
  CapOfInvisibility,
  ConfusedMonsters,
  LandMine,
  TimeBomb,
  Crusher,
  Builder,
  Climber,
}

export interface Bonus {
  type: BonusType;
  position: Position;
}

export interface Player {
  position: Position;
  previousPosition: Position;
  moveTimestamp: number;
  isInvisible: boolean;
  isVictorious: boolean;
  isVanishing: boolean;
  isClimbing: boolean;
}

export interface Obstacle {
  position: Position;
  creationTime: number;
  isRaising: boolean;
  isDestroying: boolean;
}

export type GameEndingState = 'none' | 'gameOver' | 'levelComplete';

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
  gameEndingState: GameEndingState;
}

export type Explosion = {
  position: Position;
  startTime: number;
  duration: number;
};

export type TimeBomb = {
  position: Position;
  timer: number;
  shakeIntensity: number;
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

export interface LevelConfig {
  gridSize: number;
  cellSize: number;
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
  baseGridSize: number;
  maxGridSize: number;
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
    case BonusType.Climber:
      return 'Walk on walls like a pro!';
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
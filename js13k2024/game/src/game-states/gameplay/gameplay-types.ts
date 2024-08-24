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
  spawnPoint: Position;
}

export enum BonusType {
  CapOfInvisibility,
  ConfusedMonsters,
  LandMine,
  TimeBomb,
  Crusher,
  Builder,
  Climber,
  Teleport,
  Tsunami,
  Monster,
  Slide,
  Sokoban,
  Blaster,
}

export interface Bonus {
  type: BonusType;
  position: Position;
}

export interface Player {
  position: Position;
  previousPosition: Position;
  moveTimestamp: number;
  teleportTimestamp?: number;
  isVictorious: boolean;
  isVanishing: boolean;
}

export interface Obstacle {
  position: Position;
  creationTime: number;
  isRaising: boolean;
  isDestroying: boolean;
}

type GameEndingState = 'none' | 'gameOver' | 'levelComplete';

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
  score: number;
  gameEndingState: GameEndingState;
  tsunamiLevel: number;
  blasterShots: BlasterShot[];
}

export type Explosion = {
  position: Position;
  startTime: number;
  duration: number;
};

type TimeBomb = {
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
  monsterSpawnSectors: Position[];
  obstacleCount: number;
  initialBonusCount: number;
  levelName: string;
  levelStory: string;
  levelUpdater: (state: GameState, levelConfig: LevelConfig) => void;
}

export interface PathfindingNode {
  position: Position;
  g: number;
  h: number;
  f: number;
  parent: PathfindingNode | null;
}

export interface BlasterShot {
  startPosition: Position;
  endPosition: Position;
  direction: Direction;
  shotTimestamp: number;
  duration: number;
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
    case BonusType.Teleport:
      return 'Beam me up, Scotty!';
    case BonusType.Tsunami:
      return 'Water, water everywhere!';
    case BonusType.Monster:
      return 'Tables have turned!';
    case BonusType.Slide:
      return 'Slip and slide!';
    case BonusType.Sokoban:
      return 'Push it real good!';
    case BonusType.Blaster:
      return 'Pew pew pew!';
    default:
      return 'Mystery power activated!';
  }
}

export function isActiveBonus(gameState: GameState, bonusType: BonusType) {
  return gameState.activeBonuses.some((bonus) => bonus.type === bonusType);
}
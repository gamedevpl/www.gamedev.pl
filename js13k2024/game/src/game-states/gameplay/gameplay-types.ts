export interface Position {
  x: number;
  y: number;
}

export interface Monster {
  position: Position;
  path: Position[];
}

export interface GameState {
  playerPosition: Position;
  goal: Position;
  obstacles: Position[];
  monsters: Monster[];
  steps: number;
}

export enum Direction {
  Up,
  Down,
  Left,
  Right
}

export interface GridSize {
  width: number;
  height: number;
}

export interface LevelConfig {
  gridSize: GridSize;
  initialMonsterCount: number;
  obstacleCount: number;
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
}
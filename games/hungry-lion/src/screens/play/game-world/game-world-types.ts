import { PreyState } from './prey-types';

// Lion properties
export const LION_WIDTH = 50;
export const LION_STEP_SIZE = LION_WIDTH / 3;
export const LION_MAX_SPEED = 200; // units per second

export type Vector2D = {
  x: number;
  y: number;
};

export type MovementState = {
  isMoving: boolean;
  speed: number;
  direction: Vector2D;
};

export type LionState = {
  position: Vector2D;
  targetPosition: Vector2D | null;
  movement: MovementState;
};

export type GameWorldState = {
  time: number;
  gameOver: boolean;
  gameOverStats?: GameOverStats;
  lion: LionState;
  prey: PreyState[];
};

export type GameOverStats = {
  timeSurvived: number;
};

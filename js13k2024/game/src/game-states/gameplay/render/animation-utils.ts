import { Position } from '../gameplay-types';

export const MOVE_ANIMATION_DURATION = 250; // 1/4 second
export const TELEPORT_ANIMATION_DURATION = 500; // 1/2 second
export const BLASTER_SHOT_DURATION = 50; // speed per cell

export const calculateAnimationFactor = (): number => {
  return Math.cos((Date.now() / 1000) * Math.PI);
};

export const calculateShadowSizeFactor = (animFactor: number): number => {
  return 0.5 + (animFactor / 2 + 1) / 2; // Range from 0.5 to 1
};

export interface AnimationParams {
  isoX: number;
  isoY: number;
  cellSize: number;
  baseHeight: number;
  widthFactor: number;
  heightAnimationFactor: number;
}

// New function to handle move animation interpolation
export const interpolatePosition = (
  currentPosition: Position,
  previousPosition: Position,
  moveTimestamp: number,
  duration = MOVE_ANIMATION_DURATION,
): Position => {
  const moveProgress = Math.min(Date.now() - moveTimestamp, duration) / duration;

  return {
    x: previousPosition.x + (currentPosition.x - previousPosition.x) * moveProgress,
    y: previousPosition.y + (currentPosition.y - previousPosition.y) * moveProgress,
  };
};

export const interpolateTeleportPosition = (
  currentPosition: Position,
  previousPosition: Position,
  teleportTimestamp: number,
): Position => {
  if (Date.now() - teleportTimestamp < TELEPORT_ANIMATION_DURATION / 2) {
    return previousPosition;
  } else {
    return currentPosition;
  }
};

// New function for bouncing animation
export const calculateBounceOffset = (seed: number): number => {
  const time = Date.now() / 1000;
  return Math.sin(time * 2 + seed) * 3; // Adjust the multiplier to change bounce height
};

// New function for shaking animation
export const calculateShakeOffset = (intensity: number): Position => {
  const time = Date.now() / 50; // Adjust divisor to change shake speed
  return {
    x: Math.sin(time) * intensity,
    y: Math.cos(time * 1.5) * intensity,
  };
};

export const OBSTACLE_DESTRUCTION_DURATION = 500; // 0.5 seconds

// Updated function for obstacle raise/collapse animation
export const calculateObstacleHeight = (creationTime: number, isRaising: boolean, isDestroying: boolean): number => {
  const progress = Math.min((Date.now() - creationTime) / OBSTACLE_DESTRUCTION_DURATION, 1);

  if (isDestroying) {
    return 1 - progress; // Reverse animation for destruction
  }

  return isRaising ? progress : 1;
};

// New function for confused monster shaking
export const calculateConfusedShake = (): Position => {
  return calculateShakeOffset(2); // Constant small shake for confused monsters
};

// New function for player victory jump animation
export const calculateVictoryJump = (elapsedTime: number): number => {
  const jumpDuration = 1000; // 1 second jump
  const progress = (elapsedTime % jumpDuration) / jumpDuration;
  return Math.sin(progress * Math.PI) * 20; // Adjust multiplier for jump height
};

// New function for player vanishing animation
export const calculateVanishingOpacity = (elapsedTime: number): number => {
  const vanishDuration = 2000; // 2 seconds vanish
  return Math.max(0, 1 - elapsedTime / vanishDuration);
};

export const calculateTeleportingOpacity = (elapsedTime: number): number => {
  if (elapsedTime < TELEPORT_ANIMATION_DURATION / 2) {
    return Math.max(0, 1 - (elapsedTime / 2 / (TELEPORT_ANIMATION_DURATION / 2)) * 2);
  } else {
    return Math.min(1, (elapsedTime / 2 / (TELEPORT_ANIMATION_DURATION / 2) - 0.5) * 2);
  }
};
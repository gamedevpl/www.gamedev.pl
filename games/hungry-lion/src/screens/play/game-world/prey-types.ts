export const PREY_WIDTH = 30;
export const PREY_HEIGHT = 30;
export const PREY_SPEED = 100; // units per second
export const PREY_VISION_RANGE = 200; // units
export const PREY_VISION_ANGLE = Math.PI / 3; // 60 degrees

// Duration for which prey stays in fleeing state after losing sight of lion
export const FLEE_DURATION = 3000; // milliseconds

// Distance prey needs to maintain from lion to feel safe and return to idle
export const FLEE_DISTANCE = PREY_VISION_RANGE * 1.5; // units

export type PreyState = {
  safeDistanceReached?: boolean;
  id: string;
  position: {
    x: number;
    y: number;
  };
  movement: {
    direction: {
      x: number;
      y: number;
    };
    speed: number;
  };
  state: 'idle' | 'moving' | 'fleeing';
  visionDirection: {
    x: number;
    y: number;
  };
  // Timestamp until which the prey should maintain fleeing state
  // undefined means not fleeing
  fleeingUntil?: number;
};

export type PreySpawnConfig = {
  initialCount: number;
  spawnInterval: number;
  maxCount: number;
};

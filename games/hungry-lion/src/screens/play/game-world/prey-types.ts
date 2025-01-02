export const PREY_WIDTH = 30;
export const PREY_HEIGHT = 30;
export const PREY_SPEED = 80; // units per second
export const PREY_VISION_RANGE = 200; // units
export const PREY_VISION_ANGLE = Math.PI / 3; // 60 degrees

// Duration for which prey stays in fleeing state after losing sight of threat
export const FLEE_DURATION = 3000; // milliseconds

// Distance prey needs to maintain from threat to feel safe and return to idle
export const FLEE_DISTANCE = PREY_VISION_RANGE * 1.5; // units

// Time taken to convert prey into carrion
export const CONVERSION_TIME = 2000; // milliseconds

// Time taken to eat carrion
export const EATING_TIME = 10000; // milliseconds

// Type to identify the source of fleeing behavior
export type FleeingSource = {
  type: 'lion' | 'prey';
  id: string;
  position: {
    x: number;
    y: number;
  };
};

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
  state: 'idle' | 'moving' | 'fleeing' | 'carrion';
  visionDirection: {
    x: number;
    y: number;
  };
  // Timestamp until which the prey should maintain fleeing state
  // undefined means not fleeing
  fleeingUntil?: number;
  // Source that triggered the fleeing behavior (lion or other prey)
  fleeingSource?: FleeingSource;
  // Properties for being caught and eaten
  isBeingCaught?: boolean;
  isCaught?: boolean;
  isCarrion?: boolean;
  carrionTime?: number; // Timestamp when prey became carrion
  eatingStartTime?: number; // Timestamp when eating started
  isEaten?: boolean;
  // Properties for lock-on state
  isLockedOn?: boolean;
  lockOnTime?: number; // Timestamp when prey was locked on
  // Properties for continuous chasing
  isBeingChased?: boolean;
  chaseStartTime?: number; // Timestamp when chase started
  lastKnownPosition?: {
    x: number;
    y: number;
  }; // Last known position when being chased
  movementPattern?: 'random' | 'evasive' | 'direct'; // Movement pattern when fleeing
};

export type PreySpawnConfig = {
  initialCount: number;
  spawnInterval: number;
  maxCount: number;
};

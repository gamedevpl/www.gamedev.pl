// Game world constants for Santa physics
export const SANTA_PHYSICS = {
  // Movement
  MAX_VELOCITY: 1.0,
  MIN_VELOCITY: -1.0,
  ACCELERATION: 0.0005,
  DECELERATION: 0.002,

  // Rotation
  MAX_ROTATION_SPEED: 0.002,
  ROTATION_ACCELERATION: 0.0001,
  ROTATION_DECELERATION: 0.00005,

  // Energy
  MAX_ENERGY: 100,
  ENERGY_REGENERATION: 0.01,
  FIREBALL_ENERGY_COST: 10,
  CHARGE_ENERGY_DRAIN_RATE: 0.02, // Energy drain per millisecond while charging

  // Boundaries
  MIN_HEIGHT: 100,
  MAX_HEIGHT: 900,
} as const;

// Constants for fireball physics and charging mechanics
export const FIREBALL_PHYSICS = {
  // Base stats
  BASE_VELOCITY: 0.5,
  MIN_RADIUS: 30, // Equivalent to Santa size
  GROWTH_RATE: 30, // Santa size per second

  // Charging mechanics
  MIN_CHARGE_TIME: 1000, // Minimum time to charge before fireball can be launched (ms)
  MAX_CHARGE_TIME: 5000, // Maximum time allowed for charging (ms)
  ENERGY_TO_SIZE_RATIO: 0.25, // How much energy converts to size
  ENERGY_TO_VELOCITY_RATIO: 0.001, // How much energy converts to velocity
} as const;

// Input state for Santa's movement
export type SantaInputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  charging: boolean;
  chargeStartTime: number | null; // Timestamp when charging started, null when not charging
};

export type GameWorldState = {
  time: number;
  playerSanta: Santa;
  santas: Santa[];
  gifts: Gift[];
  chimneys: Chimney[];
  fireballs: Fireball[];
};

export type Santa = {
  id: string;
  // Position
  x: number;
  y: number;

  // Velocity
  vx: number;
  vy: number;

  // Acceleration
  ax: number;
  ay: number;

  // Rotation and direction
  angle: number;
  angularVelocity: number;
  direction: 'left' | 'right';

  // Energy management
  energy: number;
  energyRegenPaused: boolean;

  // Input state
  input: SantaInputState;

  // Additional state flags
  isPlayer: boolean;
};

export type Fireball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number; // timestamp when fireball was created
  vx: number;
  vy: number;
};

export type Gift = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
};

export type Chimney = {
  id: string;
  x: number;
  y: number;
};

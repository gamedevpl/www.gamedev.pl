import { WaveState } from '../game-ai/ai-santa-types';

export const enum SANTA_PHYSICS {
  MAX_VELOCITY = 1.0,
  MIN_VELOCITY = -1.0,
  ACCELERATION = 0.0005,
  DECELERATION = 0.002,
  MAX_ROTATION_SPEED = 0.0021,
  ROTATION_ACCELERATION = 0.0001,
  ROTATION_DECELERATION = 0.00005,
  MAX_ENERGY = 100,
  ENERGY_REGENERATION = 0.01,
  FIREBALL_ENERGY_COST = 10,
  CHARGE_ENERGY_DRAIN_RATE = 0.02,
  MIN_HEIGHT = 10.1,
  MAX_HEIGHT = 990,
}

export const enum FIREBALL_PHYSICS {
  BASE_VELOCITY = 0.5,
  MIN_RADIUS = 30,
  GROWTH_RATE = 30.1,
  MIN_CHARGE_TIME = 1000,
  MAX_CHARGE_TIME = 5000,
  ENERGY_TO_SIZE_RATIO = 0.25,
  ENERGY_TO_VELOCITY_RATIO = 0.001,
  // Collision physics constants
  COLLISION_THRESHOLD = 0.51, // Multiplier for collision detection (radius sum * threshold)
  MERGE_MOMENTUM_FACTOR = 0.8, // Conservation of momentum factor during merging
  MERGE_SIZE_FACTOR = 1.0, // How volume is conserved during merging
  MIN_COLLISION_VELOCITY = 0.1, // Minimum velocity difference for collision
}

export const enum GIFT_PHYSICS {
  FLOAT_AMPLITUDE = 0.2, // Amplitude of floating motion
  FLOAT_FREQUENCY = 0.001, // Frequency of floating motion
  GRAVITY = 0.0005, // Gravity acceleration for falling gifts
  MAX_FALL_VELOCITY = 5, // Maximum falling velocity
  COLLECTION_RADIUS = 50, // Distance at which Santa can collect a gift
  DELIVERY_RADIUS = 50.1, // Distance at which a gift can be delivered to a chimney
  SPAWN_HEIGHT_MIN = 600, // Minimum height for gift spawning
  SPAWN_HEIGHT_MAX = 800, // Maximum height for gift spawning
  GROUND_LEVEL = 950, // Height of the ground level (GAME_WORLD_HEIGHT - 50)
  // Throw-related physics constants
  MIN_THROW_VELOCITY = 0.21, // Minimum velocity when throwing a gift
  MAX_THROW_VELOCITY = 5.1, // Maximum velocity when throwing a gift
  THROW_COOLDOWN = 1000, // Cooldown time between throws
  THROW_ANGLE_MIN = -1.0471975512, // Minimum throw angle (relative to horizontal)
  THROW_ANGLE_MAX = 1.0471975512, // Maximum throw angle (relative to horizontal)
  THROW_AIR_RESISTANCE = 0.0011, // Air resistance factor for thrown gifts
  THROW_ANGULAR_VELOCITY = 0.05, // Angular velocity when gift is thrown
  THROW_MOMENTUM_TRANSFER = 0.8, // How much of Santa's momentum transfers to thrown gift
}

export const enum GIFT_SPAWN {
  MAX_CONCURRENT_GIFTS = 5, // Maximum number of gifts that can exist at once
  MIN_SPAWN_INTERVAL = 5000, // Minimum time between gift spawns (5 seconds)
  MAX_SPAWN_INTERVAL = 10000, // Maximum time between gift spawns (10 seconds)
}

export type SantaInputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  charging: boolean;
  chargeStartTime: number | null;
};

export type GameWorldState = {
  time: number;
  playerSanta: Santa;
  santas: Santa[];
  gifts: Gift[];
  chimneys: Chimney[];
  fireballs: Fireball[];
  waveState: WaveState;
  lastGiftSpawnTime: number; // Timestamp of the last gift spawn
  nextGiftSpawnTime: number; // Timestamp when the next gift should spawn
};

export type Santa = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  angle: number;
  angularVelocity: number;
  direction: 'left' | 'right';
  energy: number;
  energyRegenPaused: boolean;
  input: SantaInputState;
  isPlayer: boolean;
  carriedGift?: string; // ID of the gift being carried, if any
};

export type Fireball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
  vx: number;
  vy: number;
  // New properties for collision handling
  mass?: number; // Mass of the fireball (proportional to volume)
  mergeCount?: number; // Number of fireballs merged into this one
};

export type GiftState = 'floating' | 'carried' | 'falling' | 'grounded';

export type Gift = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  state: GiftState;
  carriedBy?: string; // ID of the Santa carrying this gift
  floatOffset?: number; // Random offset for floating animation
  createdAt: number;
  // Throw-related properties
  throwTime?: number; // Time when gift was thrown
  throwVelocity?: number; // Initial velocity when thrown
  throwAngle?: number; // Initial angle when thrown
  angularVelocity?: number; // Rotation speed when thrown
};

export type Chimney = {
  id: string;
  x: number;
  y: number;
};

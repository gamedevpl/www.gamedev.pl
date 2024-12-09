import { WaveState } from '../game-ai/ai-santa-types';

export const enum SANTA_PHYSICS {
  MAX_VELOCITY = 1.0,
  MIN_VELOCITY = -1.0,
  ACCELERATION = 0.0005,
  DECELERATION = 0.002,
  MAX_ENERGY = 100,
  ENERGY_REGENERATION = 0.01,
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
  // Pushback physics constants
  PUSHBACK_BASE_FORCE = 0.0512, // Base force applied when a fireball hits a Santa
  PUSHBACK_RADIUS_MULTIPLIER = 0.02, // How much the fireball's radius affects pushback force
  PUSHBACK_DISTANCE_FACTOR = 1.012, // How distance from center affects force (higher = stronger distance falloff)
  MAX_PUSHBACK_VELOCITY = 1.01, // Maximum velocity that can be applied from pushback
}

export const enum GIFT_CONSTANTS {
  // Gift collection
  COLLECTION_RADIUS = 50, // Distance at which Santa can collect a gift
  ENERGY_BOOST = 25, // Amount of energy gained from collecting a gift

  // Gift floating animation
  FLOAT_AMPLITUDE = 0.2, // Amplitude of floating motion
  FLOAT_FREQUENCY = 0.001, // Frequency of floating motion

  // Gift spawning
  SPAWN_HEIGHT_MIN = 600, // Minimum height for gift spawning
  SPAWN_HEIGHT_MAX = 800, // Maximum height for gift spawning
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

// Available color themes for Santas
export type SantaColorTheme = 'classic' | 'dedMoroz';

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
  colorTheme?: SantaColorTheme; // Optional color theme property
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

export type Gift = {
  id: string;
  x: number;
  y: number;
  floatOffset?: number; // Random offset for floating animation
  createdAt: number;
};

type Chimney = {
  id: string;
  x: number;
  y: number;
};

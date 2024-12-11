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
  BASE_VELOCITY = 1.0,
  MIN_RADIUS = 30,
  GROWTH_RATE = 30.1,
  MIN_CHARGE_TIME = 1000,
  MAX_CHARGE_TIME = 5000,
  ENERGY_TO_SIZE_RATIO = 0.25,
  ENERGY_TO_VELOCITY_RATIO = 0.001,
  GROWTH_DURATION = 500,

  // Collision detection constants
  COLLISION_MARGIN = 0.9, // Margin for collision detection (0.9 means collision starts at 90% of visual radius)
  COLLISION_GROWTH_THRESHOLD = 0.3, // Threshold for when growing fireballs start collision detection
  COLLISION_VISUAL_SCALE = 0.95, // Scale factor for visual vs. collision radius (helps with visual consistency)

  // Collision physics constants
  COLLISION_THRESHOLD = 0.951, // Adjusted from 0.51 for more accurate collisions
  MERGE_MOMENTUM_FACTOR = 0.8,
  MERGE_SIZE_FACTOR = 1.011,
  MIN_COLLISION_VELOCITY = 0.1,

  // Progressive collision sensitivity
  COLLISION_SENSITIVITY_MIN = 0.85, // Minimum collision sensitivity (outer edge)
  COLLISION_SENSITIVITY_MAX = 1.01, // Maximum collision sensitivity (center)
  COLLISION_SENSITIVITY_CURVE = 2.0, // Power curve for sensitivity progression (higher = sharper transition)

  // Pushback mechanics
  PUSHBACK_BASE_FORCE = 0.005, // Reduced from 0.025 for gentler pushback
  PUSHBACK_RADIUS_MULTIPLIER = 0.003, // Reduced from 0.015 for more balanced size impact
  PUSHBACK_DISTANCE_FACTOR = 1.0111, // Reduced from 1.5 for smoother distance falloff
  PUSHBACK_MIN_FORCE = 0.01, // Minimum force applied on collision
  PUSHBACK_MAX_FORCE = 0.05, // Reduced from 0.5 for gentler maximum force
  MAX_PUSHBACK_VELOCITY = 0.11, // Reduced from 0.81 for minimal knockback

  // Momentum transfer
  MOMENTUM_TRANSFER_RATE = 0.6, // How much of fireball's momentum transfers to Santa
  VELOCITY_DAMPENING = 0.851, // Dampening factor for transferred velocity
}

export const enum GIFT_CONSTANTS {
  // Gift collection
  COLLECTION_RADIUS = 50,
  ENERGY_BOOST = 25,

  // Gift floating animation
  FLOAT_AMPLITUDE = 0.2,
  FLOAT_FREQUENCY = 0.001,

  // Gift spawning
  SPAWN_HEIGHT_MIN = 600,
  SPAWN_HEIGHT_MAX = 800,
  MAX_CONCURRENT_GIFTS = 5,
  MIN_SPAWN_INTERVAL = 5000,
  MAX_SPAWN_INTERVAL = 10000,
}

export type SantaInputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  charging: boolean;
  chargeStartTime: number | null;
};

export type GameOverStats = {
  timeSurvived: number;
  giftsCollected: number;
  santasEliminated: number;
  finalWave: number;
};

export type GameWorldState = {
  time: number;
  playerSanta: Santa;
  santas: Santa[];
  gifts: Gift[];
  chimneys: Chimney[];
  fireballs: Fireball[];
  waveState: WaveState;
  lastGiftSpawnTime: number;
  nextGiftSpawnTime: number;
  gameOver: boolean;
  gameOverStats?: GameOverStats;
  giftsCollectedCount: number; // Track total gifts collected for stats
  santasEliminatedCount: number; // Track total santas eliminated for stats
};

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
  colorTheme?: SantaColorTheme;
  isEliminated: boolean;
  eliminatedAt?: number;
};

export type Fireball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  growthEndTime: number;
  createdAt: number;
  vx: number;
  vy: number;
  mass?: number;
  mergeCount?: number;
};

export type Gift = {
  id: string;
  x: number;
  y: number;
  floatOffset?: number;
  createdAt: number;
};

type Chimney = {
  id: string;
  x: number;
  y: number;
};
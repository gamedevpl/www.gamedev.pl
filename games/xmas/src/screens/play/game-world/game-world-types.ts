import { WaveState } from '../game-ai/ai-santa-types';

export const enum SANTA_PHYSICS {
  MAX_VELOCITY = 1.0,
  MIN_VELOCITY = -1.0,
  ACCELERATION = 0.0005,
  DECELERATION = 0.002,
  MAX_ENERGY = 100,
  NEGATIVE_ENERGY_LIMIT = -10, // Maximum allowed negative energy
  ENERGY_REGENERATION = 0.01,
  MIN_HEIGHT = 10.1,
  MAX_HEIGHT = 990,
  FIREBALL_CONTACT_ENERGY_DRAIN_RATE = 0.05, // Energy drain per millisecond of fireball contact
}

export const enum DIALOGUE_CONSTANTS {
  FADE_IN_DURATION = 200,
  FADE_OUT_DURATION = 300,
  DISPLAY_DURATION = 2000,
  VERTICAL_OFFSET = -50,
  LOW_ENERGY_THRESHOLD = 25, // 25% of max energy
  DIALOGUE_COOLDOWN = 1500, // Minimum time between dialogues
  MAX_CONCURRENT_DIALOGUES = 2,
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
  COLLISION_MARGIN = 0.9,
  COLLISION_GROWTH_THRESHOLD = 0.3,
  COLLISION_VISUAL_SCALE = 0.95,

  // Collision physics constants
  COLLISION_THRESHOLD = 0.951,
  MERGE_MOMENTUM_FACTOR = 0.8,
  MERGE_SIZE_FACTOR = 1.011,
  MIN_COLLISION_VELOCITY = 0.1,

  // Progressive collision sensitivity
  COLLISION_SENSITIVITY_MIN = 0.85,
  COLLISION_SENSITIVITY_MAX = 1.01,
  COLLISION_SENSITIVITY_CURVE = 2.0,

  // Pushback mechanics
  PUSHBACK_BASE_FORCE = 0.005,
  PUSHBACK_RADIUS_MULTIPLIER = 0.003,
  PUSHBACK_DISTANCE_FACTOR = 1.0111,
  PUSHBACK_MIN_FORCE = 0.01,
  PUSHBACK_MAX_FORCE = 0.05,
  MAX_PUSHBACK_VELOCITY = 0.11,

  // Momentum transfer
  MOMENTUM_TRANSFER_RATE = 0.6,
  VELOCITY_DAMPENING = 0.851,

  // Launcher immunity
  LAUNCHER_IMMUNITY_DURATION = 1000.01,
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

export type DialogueText = {
  id: string;
  text: string;
  createdAt: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  opacity: number;
};

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
  giftsCollectedCount: number;
  santasEliminatedCount: number;
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
  fireballContactTime?: number;
  // Dialogue-related properties
  dialogues: DialogueText[];
  lastDialogueTime?: number;
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
  launcherId: string;
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
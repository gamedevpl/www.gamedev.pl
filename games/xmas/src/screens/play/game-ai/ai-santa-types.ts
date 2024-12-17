import { Santa } from '../game-world/game-world-types';

/**
 * AI Santa behavior states
 */
export const enum AI_BEHAVIOR_STATE {
  WANDER = 'WANDER', // Random movement
  CHASE = 'CHASE', // Following target
  ATTACK = 'ATTACK', // Charging and shooting
}

/**
 * Wave status enumeration
 */
export const enum WAVE_STATUS {
  PREPARING = 'PREPARING', // Wave is about to start
  IN_PROGRESS = 'IN_PROGRESS', // Wave is currently active
  COMPLETED = 'COMPLETED', // Wave has been completed
}

/**
 * Wave progression constants
 */
export const WAVE_CONFIG = {
  PREPARATION_TIME: 3000, // Time between waves (ms)
  DIFFICULTY_SCALING: {
    ENERGY_REGEN_MULTIPLIER: 0.1, // Energy regeneration increase per wave
    SPEED_MULTIPLIER: 0.05, // Speed increase per wave
    ACCURACY_MULTIPLIER: 0.05, // Accuracy increase per wave
  },
  REWARDS: {
    BASE_SCORE: 100, // Base score for completing a wave
  },
} as const;

/**
 * AI Santa configuration constants
 */
export const AI_CONFIG = {
  // Movement
  WANDER_CHANGE_DIRECTION_TIME: 2000, // Time between random direction changes (ms)
  CHASE_DISTANCE: 400, // Distance at which AI starts chasing player
  ATTACK_DISTANCE: 300, // Distance at which AI starts attacking

  // Combat
  MIN_ATTACK_INTERVAL: 3000, // Minimum time between attacks (ms)
  MAX_ATTACK_INTERVAL: 6000, // Maximum time between attacks (ms)
  MIN_CHARGE_TIME: 800, // Minimum fireball charge time (ms)
  MAX_CHARGE_TIME: 2000, // Maximum fireball charge time (ms)
  ATTACK_COOLDOWN: 1500, // Time after attack before next charge (ms)
  ATTACK_ENERGY_THRESHOLD: 0, // Minimum energy required to start charging

  // Difficulty scaling
  BASE_ENERGY_REGEN_MULTIPLIER: 0.8, // Energy regeneration rate compared to player
  WAVE_ENERGY_REGEN_INCREASE: 0.1, // Energy regen increase per wave

  // Spawn positions
  SPAWN_MARGIN: 100, // Minimum distance from edges when spawning
} as const;

/**
 * AI Santa state information
 */
type AISantaState = {
  behaviorState: AI_BEHAVIOR_STATE;
  lastDirectionChange: number;
  lastAttackTime: number;
  targetX: number | null;
  targetY: number | null;
  currentChargeStartTime: number | null; // Track current charge start time
};

/**
 * AI Santa type extending base Santa type
 */
export type AISanta = Santa & {
  ai: AISantaState;
};

/**
 * AI decision result type
 */
export type AIDecision = {
  input: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    charging: boolean;
    chargeStartTime: number | null;
  };
  direction: 'left' | 'right';
};

/**
 * Wave state tracking with enhanced information
 */
export type WaveState = {
  currentWave: number;
  santasRemaining: number;
  nextSpawnTime: number | null;
  status: WAVE_STATUS;
  startTime?: number; // When the current wave started
  completionTime?: number; // When the current wave was completed
  difficultyMultiplier: number; // Current difficulty scaling
};

/**
 * Calculate difficulty multiplier based on wave number
 */
export function calculateDifficultyMultiplier(waveNumber: number): number {
  const baseMultiplier = 1.0;
  const waveScaling = (waveNumber - 1) * 0.1; // 10% increase per wave
  return baseMultiplier + waveScaling;
}

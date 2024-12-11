import { GAME_WORLD_WIDTH } from './game-world-consts';
import { GameWorldState, Santa, SANTA_PHYSICS } from './game-world-types';

/**
 * Updates Santa's physics state based on current input and constraints
 * Returns false if physics update should be skipped (e.g., Santa is eliminated)
 */
export function updateSantaPhysics(santa: Santa, deltaTime: number): boolean {
  // Skip physics update for eliminated Santas
  if (santa.isEliminated) {
    return false;
  }

  if (santa.input.left) {
    santa.ax = -SANTA_PHYSICS.ACCELERATION;
  } else if (santa.input.right) {
    santa.ax = SANTA_PHYSICS.ACCELERATION;
  } else {
    santa.ax = -santa.vx * SANTA_PHYSICS.DECELERATION;
  }
  if (santa.input.up) {
    santa.ay = -SANTA_PHYSICS.ACCELERATION;
  } else if (santa.input.down) {
    santa.ay = SANTA_PHYSICS.ACCELERATION;
  } else {
    santa.ay = -santa.vy * SANTA_PHYSICS.DECELERATION;
  }

  // Update velocities based on acceleration
  santa.vx += santa.ax * deltaTime;
  santa.vy += santa.ay * deltaTime;

  // Apply velocity constraints
  santa.vx = Math.max(SANTA_PHYSICS.MIN_VELOCITY, Math.min(SANTA_PHYSICS.MAX_VELOCITY, santa.vx));
  santa.vy = Math.max(SANTA_PHYSICS.MIN_VELOCITY, Math.min(SANTA_PHYSICS.MAX_VELOCITY, santa.vy));

  // Update position
  santa.x += santa.vx * deltaTime;
  santa.y += santa.vy * deltaTime;

  // Apply world boundaries
  santa.x = Math.max(0, Math.min(GAME_WORLD_WIDTH, santa.x));
  santa.y = Math.max(SANTA_PHYSICS.MIN_HEIGHT, Math.min(SANTA_PHYSICS.MAX_HEIGHT, santa.y));

  // Update rotation based on angular velocity
  santa.angle += santa.angularVelocity * deltaTime;

  // Normalize angle to [0, 2π]
  santa.angle = santa.angle % (Math.PI * 2);
  if (santa.angle < 0) {
    santa.angle += Math.PI * 2;
  }

  return true;
}

/**
 * Updates Santa's energy level and handles regeneration
 * Returns false if energy update should be skipped (e.g., Santa is eliminated)
 */
export function updateSantaEnergy(santa: Santa, deltaTime: number): boolean {
  // Skip energy update for eliminated Santas
  if (santa.isEliminated) {
    return false;
  }

  // Check for elimination condition (energy <= 0)
  if (santa.energy <= 0) {
    santa.energy = 0;
    santa.isEliminated = true;
    santa.eliminatedAt = Date.now();
    return false;
  }

  if (!santa.energyRegenPaused && santa.energy < SANTA_PHYSICS.MAX_ENERGY) {
    santa.energy = Math.min(SANTA_PHYSICS.MAX_ENERGY, santa.energy + SANTA_PHYSICS.ENERGY_REGENERATION * deltaTime);
  }

  return true;
}

/**
 * Updates Santa's charging state and energy consumption
 * Returns false if charging update should be skipped (e.g., Santa is eliminated)
 */
export function updateSantaCharging(state: GameWorldState): boolean {
  const { playerSanta } = state;

  // Skip charging update for eliminated Santas
  if (playerSanta.isEliminated) {
    // Ensure charging is stopped when eliminated
    playerSanta.input.charging = false;
    playerSanta.input.chargeStartTime = null;
    playerSanta.energyRegenPaused = false;
    return false;
  }

  const { input } = playerSanta;

  if (input.charging && input.chargeStartTime !== null) {
    // Pause energy regeneration while charging
    playerSanta.energyRegenPaused = true;
  } else {
    // Allow energy regeneration when not charging
    playerSanta.energyRegenPaused = false;
  }

  return true;
}
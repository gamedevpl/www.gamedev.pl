import {
  PREY_BASE_SPEED,
  PREY_FLEE_SPEED_MODIFIER,
  PREY_SLOW_SPEED_MODIFIER,
  PREY_HUNGER_THRESHOLD_SLOW,
} from '../../../world-consts';
import { PreyEntity } from './prey-types';

/**
 * Calculate effective speed for prey considering age, hunger, and special conditions
 */
export function getEffectivePreySpeed(prey: PreyEntity): number {
  let effectiveSpeed = PREY_BASE_SPEED;

  // Apply flee speed boost when fleeing
  if (prey.activeAction === 'fleeing') {
    effectiveSpeed *= PREY_FLEE_SPEED_MODIFIER;
  }

  // Apply hunger slowdown if too hungry
  if (prey.hunger >= PREY_HUNGER_THRESHOLD_SLOW) {
    effectiveSpeed *= PREY_SLOW_SPEED_MODIFIER;
  }

  // Young animals are slower
  if (!prey.isAdult) {
    effectiveSpeed *= 0.7;
  }

  // Apply movement slowdown from being hit
  if (prey.movementSlowdown) {
    effectiveSpeed *= prey.movementSlowdown.modifier;
  }

  return effectiveSpeed;
}

/**
 * Combine two gene codes with mutation to create offspring gene code
 */
export function combineGenes(motherGeneCode: number, fatherGeneCode: number): number {
  // Extract RGB components from parent genes
  const motherR = (motherGeneCode >> 16) & 0xFF;
  const motherG = (motherGeneCode >> 8) & 0xFF;
  const motherB = motherGeneCode & 0xFF;

  const fatherR = (fatherGeneCode >> 16) & 0xFF;
  const fatherG = (fatherGeneCode >> 8) & 0xFF;
  const fatherB = fatherGeneCode & 0xFF;

  // Combine genes (average with some randomness)
  let childR = Math.floor((motherR + fatherR) / 2);
  let childG = Math.floor((motherG + fatherG) / 2);
  let childB = Math.floor((motherB + fatherB) / 2);

  // Apply mutations (5% chance for each color component)
  if (Math.random() < 0.05) {
    childR = Math.max(0, Math.min(255, childR + (Math.random() - 0.5) * 60));
  }
  if (Math.random() < 0.05) {
    childG = Math.max(0, Math.min(255, childG + (Math.random() - 0.5) * 60));
  }
  if (Math.random() < 0.05) {
    childB = Math.max(0, Math.min(255, childB + (Math.random() - 0.5) * 60));
  }

  // Combine back into a single gene code
  return (childR << 16) | (childG << 8) | childB;
}

/**
 * Generate a random gene code for initial prey
 */
export function generateRandomPreyGeneCode(): number {
  // Generate brownish colors typical for prey animals
  const r = Math.floor(Math.random() * 100) + 100; // 100-199
  const g = Math.floor(Math.random() * 80) + 60;   // 60-139
  const b = Math.floor(Math.random() * 60) + 20;   // 20-79
  return (r << 16) | (g << 8) | b;
}
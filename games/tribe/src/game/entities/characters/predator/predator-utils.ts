import {
  PREDATOR_BASE_SPEED,
  PREDATOR_SLOW_SPEED_MODIFIER,
  PREDATOR_HUNGER_THRESHOLD_SLOW
} from '../../../animal-consts.ts';
import { PredatorEntity } from './predator-types';

/**
 * Calculate effective speed for predator considering age, hunger, and special conditions
 */
export function getEffectivePredatorSpeed(predator: PredatorEntity): number {
  let effectiveSpeed = PREDATOR_BASE_SPEED;

  // Apply hunger slowdown if too hungry
  if (predator.hunger >= PREDATOR_HUNGER_THRESHOLD_SLOW) {
    effectiveSpeed *= PREDATOR_SLOW_SPEED_MODIFIER;
  }

  // Young animals are slower
  if (!predator.isAdult) {
    effectiveSpeed *= 0.7;
  }

  // Apply movement slowdown from being hit
  if (predator.movementSlowdown) {
    effectiveSpeed *= predator.movementSlowdown.modifier;
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
 * Generate a random gene code for initial predators
 */
export function generateRandomPredatorGeneCode(): number {
  // Generate darker, more muted colors typical for predators
  const r = Math.floor(Math.random() * 60) + 60;  // 60-119
  const g = Math.floor(Math.random() * 50) + 40;  // 40-89
  const b = Math.floor(Math.random() * 40) + 20;  // 20-59
  return (r << 16) | (g << 8) | b;
}
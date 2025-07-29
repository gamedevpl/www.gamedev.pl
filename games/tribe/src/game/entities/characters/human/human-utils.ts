import {
  HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD,
  HUMAN_HUNGER_THRESHOLD_SLOW,
} from '../../../world-consts';
import { HumanEntity } from './human-types';

export function getEffectiveSpeed(human: HumanEntity): number {
  // Speed constants
  const HUMAN_BASE_SPEED = 10; // Base movement speed in pixels per second
  const HUMAN_SLOW_SPEED_MODIFIER = 0.5; // Speed modifier when hunger > threshold
  const HUMAN_OLD_AGE_SPEED_MODIFIER = 0.7; // Speed modifier for old age (e.g., 0.7 for 70% speed)

  // Calculate effective speed considering hunger, old age, and attack slowdowns
  let effectiveSpeed = HUMAN_BASE_SPEED;

  // Apply hunger slowdown
  if (human.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
    effectiveSpeed *= HUMAN_SLOW_SPEED_MODIFIER;
  }

  // Apply old age slowdown
  if (human.age >= HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD) {
    effectiveSpeed *= HUMAN_OLD_AGE_SPEED_MODIFIER;
  }

  // Apply movement slowdown from being hit
  if (human.movementSlowdown) {
    effectiveSpeed *= human.movementSlowdown.modifier;
  }

  return effectiveSpeed;
}

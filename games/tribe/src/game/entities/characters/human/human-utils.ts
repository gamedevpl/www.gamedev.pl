import {
  HUMAN_BASE_SPEED,
  HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD,
  HUMAN_OLD_AGE_SPEED_MODIFIER,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_SLOW_SPEED_MODIFIER
} from '../../../human-consts.ts';
import { HumanEntity } from './human-types';

export function getEffectiveSpeed(human: HumanEntity): number {
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

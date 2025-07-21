import {
  HUMAN_BASE_SPEED,
  HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD,
  HUMAN_OLD_AGE_SPEED_MODIFIER,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_SLOW_SPEED_MODIFIER,
} from '../../../world-consts';
import { HumanEntity } from './human-types';

export function getEffectiveSpeed(human: HumanEntity): number {
  // Calculate effective speed considering hunger and old age
  let effectiveSpeed = HUMAN_BASE_SPEED;

  // Apply hunger slowdown
  if (human.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
    effectiveSpeed *= HUMAN_SLOW_SPEED_MODIFIER;
  }

  // Apply old age slowdown
  if (human.age >= HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD) {
    effectiveSpeed *= HUMAN_OLD_AGE_SPEED_MODIFIER;
  }

  return effectiveSpeed;
}

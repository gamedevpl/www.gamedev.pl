import { HumanEntity } from '../entities/characters/human/human-types';
import { HUMAN_FEMALE_MAX_PROCREATION_AGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../world-consts';

/**
 * Checks if two human entities are hostile towards each other.
 * Hostility is currently defined as belonging to different tribes.
 *
 * @param human1 The first human entity.
 * @param human2 The second human entity.
 * @returns `true` if the humans are hostile, `false` otherwise.
 */
export const isHostile = (human1: HumanEntity, human2: HumanEntity): boolean => {
  // Cannot be hostile to oneself
  if (human1.id === human2.id) {
    return false;
  }

  // Hostile if they are not in the same tribe (different leaders)
  return human1.leaderId !== human2.leaderId;
};

/**
 * Checks if two human entities can procreate with each other.
 * This function consolidates all the necessary conditions for procreation.
 *
 * @param human1 The first human entity.
 * @param human2 The second human entity.
 * @returns `true` if they can procreate, `false` otherwise.
 */
export const canProcreate = (human1: HumanEntity, human2: HumanEntity): boolean => {
  // Basic checks that apply to both partners
  if (
    human1.id === human2.id ||
    human1.gender === human2.gender ||
    !human1.isAdult ||
    !human2.isAdult ||
    human1.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
    human2.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
    (human1.procreationCooldown || 0) > 0 ||
    (human2.procreationCooldown || 0) > 0 ||
    human1.leaderId !== human2.leaderId
  ) {
    return false;
  }

  // Identify the female and perform female-specific checks
  const female = human1.gender === 'female' ? human1 : human2;

  if (female.isPregnant || female.age > HUMAN_FEMALE_MAX_PROCREATION_AGE) {
    return false;
  }

  return true;
};

import { HumanEntity } from '../entities/characters/human/human-types';
import { HUMAN_FEMALE_MAX_PROCREATION_AGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../world-consts';
import { DiplomacyStatus, GameWorldState } from '../world-types';

/**
 * Checks if two human entities are hostile towards each other.
 * Hostility is determined by the diplomatic status between their tribes.
 *
 * @param human1 The first human entity.
 * @param human2 The second human entity.
 * @param gameState The current game world state.
 * @returns `true` if the humans are hostile, `false` otherwise.
 */
export const isHostile = (human1: HumanEntity, human2: HumanEntity, gameState: GameWorldState): boolean => {
  // Cannot be hostile to oneself
  if (human1.id === human2.id) {
    return false;
  }

  if (!!human1.leaderId && !human2.leaderId) {
    return true; // One of them is not part of a tribe
  }

  // Not hostile if they are in the same tribe
  if (human1.leaderId === human2.leaderId) {
    return false;
  }

  // Check diplomacy status if they are in different tribes
  if (human1.leaderId && human2.leaderId) {
    const tribe1Diplomacy = (gameState.entities.entities.get(human1.leaderId) as HumanEntity)?.diplomacy?.get(
      human2.leaderId,
    );
    const tribe2Diplomacy = (gameState.entities.entities.get(human2.leaderId) as HumanEntity)?.diplomacy?.get(
      human1.leaderId,
    );
    return tribe1Diplomacy === DiplomacyStatus.Hostile || tribe2Diplomacy === DiplomacyStatus.Hostile;
  }

  // Default to not hostile if tribe information is missing
  return false;
};

/**
 * Checks if two human entities can procreate with each other.
 * This function consolidates all the necessary conditions for procreation, including diplomacy.
 *
 * @param human1 The first human entity.
 * @param human2 The second human entity.
 * @param gameState The current game world state.
 * @returns `true` if they can procreate, `false` otherwise.
 */
export const canProcreate = (human1: HumanEntity, human2: HumanEntity, gameState: GameWorldState): boolean => {
  // Basic checks that apply to both partners
  if (
    human1.id === human2.id ||
    human1.gender === human2.gender ||
    !human1.isAdult ||
    !human2.isAdult ||
    human1.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
    human2.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
    (human1.procreationCooldown || 0) > 0 ||
    (human2.procreationCooldown || 0) > 0
  ) {
    return false;
  }

  // Diplomacy check: procreation is only allowed between members of the same tribe or friendly tribes
  if (isHostile(human1, human2, gameState)) {
    return false;
  }

  // Identify the female and perform female-specific checks
  const female = human1.gender === 'female' ? human1 : human2;

  if (female.isPregnant || female.age > HUMAN_FEMALE_MAX_PROCREATION_AGE) {
    return false;
  }

  return true;
};

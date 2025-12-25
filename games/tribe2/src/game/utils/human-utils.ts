import { HumanEntity } from '../entities/characters/human/human-types';
import { HUMAN_FEMALE_MAX_PROCREATION_AGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../human-consts.ts';
import { DiplomacyStatus, GameWorldState } from '../world-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { EntityId } from '../entities/entities-types';

/**
 * Checks if two tribes are hostile towards each other.
 * Hostility is reciprocal: if either tribe considers the other hostile, they are at war.
 *
 * @param tribeId1 The leader ID of the first tribe.
 * @param tribeId2 The leader ID of the second tribe.
 * @param gameState The current game world state.
 * @returns `true` if the tribes are hostile, `false` otherwise.
 */
export const isTribeHostile = (
  tribeId1: EntityId | undefined,
  tribeId2: EntityId | undefined,
  gameState: GameWorldState,
): boolean => {
  if (!tribeId1 || !tribeId2 || tribeId1 === tribeId2) return false;

  const leader1 = gameState.entities.entities[tribeId1] as HumanEntity | undefined;
  const leader2 = gameState.entities.entities[tribeId2] as HumanEntity | undefined;

  const tribe1Diplomacy = leader1?.tribeControl?.diplomacy?.[tribeId2];
  const tribe2Diplomacy = leader2?.tribeControl?.diplomacy?.[tribeId1];

  return tribe1Diplomacy === DiplomacyStatus.Hostile || tribe2Diplomacy === DiplomacyStatus.Hostile;
};

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

  // Hostility is based on tribe relations
  return isTribeHostile(human1.leaderId, human2.leaderId, gameState);
};

/**
 * Checks if a building belongs to an enemy tribe.
 *
 * @param human The human entity checking the building.
 * @param building The building entity to check.
 * @param gameState The current game world state.
 * @returns `true` if the building belongs to a hostile tribe, `false` otherwise.
 */
export const isEnemyBuilding = (human: HumanEntity, building: BuildingEntity, gameState: GameWorldState): boolean => {
  // 1. The human must have a leaderId (be part of a tribe)
  if (!human.leaderId) {
    return false;
  }

  // 2. The building must have an ownerId
  if (!building.ownerId) {
    return false;
  }

  // 3. The building's owner is the human's leader (same tribe)
  if (building.ownerId === human.leaderId) {
    return false;
  }

  // 4. Check hostility between tribes
  return isTribeHostile(human.leaderId, building.ownerId, gameState);
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

  // Diplomacy check: procreation is only allowed between members of the same tribe or tribe is not hostile towards the other
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

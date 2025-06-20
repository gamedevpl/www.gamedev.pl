import { HumanEntity } from '../entities/characters/human/human-types';
import { KARMA_DECAY_RATE_PER_HOUR, KARMA_INHERITANCE_FACTOR, KARMA_PROPAGATION_FACTOR } from '../world-consts';
import { GameWorldState } from '../world-types';
import { getFamilyMembers } from '../utils/world-utils';

/**
 * Applies a karma change from a source human to a target human and propagates it to their families.
 */
export function applyKarma(
  source: HumanEntity,
  target: HumanEntity,
  karmaChange: number,
  gameState: GameWorldState,
): void {
  // Apply direct karma
  source.karma[target.id] = (source.karma[target.id] || 0) + karmaChange;

  // Propagate karma to families
  propagateKarma(source, target, karmaChange * KARMA_PROPAGATION_FACTOR, gameState);
}

/**
 * Propagates a portion of a karma change to the families of the involved humans.
 */
function propagateKarma(
  originalSource: HumanEntity,
  originalTarget: HumanEntity,
  propagatedKarma: number,
  gameState: GameWorldState,
): void {
  const sourceFamily = getFamilyMembers(originalSource, gameState);
  const targetFamily = getFamilyMembers(originalTarget, gameState);

  // Propagate from source's family to the original target
  for (const familyMember of sourceFamily) {
    if (familyMember.id !== originalTarget.id) {
      familyMember.karma[originalTarget.id] = (familyMember.karma[originalTarget.id] || 0) + propagatedKarma;
    }
  }

  // Propagate from the original source to the target's family
  for (const familyMember of targetFamily) {
    if (familyMember.id !== originalSource.id) {
      originalSource.karma[familyMember.id] = (originalSource.karma[familyMember.id] || 0) + propagatedKarma;
    }
  }
}

/**
 * Decays all karma values for a human over time, moving them towards zero.
 */
export function decayKarma(human: HumanEntity, gameHoursDelta: number): void {
  for (const targetId in human.karma) {
    const karmaValue = human.karma[targetId];
    const decayAmount = KARMA_DECAY_RATE_PER_HOUR * gameHoursDelta;

    if (karmaValue > 0) {
      human.karma[targetId] = Math.max(0, karmaValue - decayAmount);
    } else if (karmaValue < 0) {
      human.karma[targetId] = Math.min(0, karmaValue + decayAmount);
    }

    // Clean up neutral karma entries
    if (human.karma[targetId] === 0) {
      delete human.karma[targetId];
    }
  }
}

/**
 * Calculates a newborn's initial karma based on its parents' karma maps.
 */
export function inheritKarma(child: HumanEntity, mother: HumanEntity, father: HumanEntity | undefined): void {
  const combinedKarma: Record<number, number> = {};

  // Combine karma from mother
  for (const targetId in mother.karma) {
    combinedKarma[targetId] = (combinedKarma[targetId] || 0) + mother.karma[targetId];
  }

  // Combine karma from father
  if (father) {
    for (const targetId in father.karma) {
      combinedKarma[targetId] = (combinedKarma[targetId] || 0) + father.karma[targetId];
    }
  }

  // Apply inherited karma to the child
  for (const targetId in combinedKarma) {
    const inheritedValue = combinedKarma[targetId] * KARMA_INHERITANCE_FACTOR;
    if (Math.abs(inheritedValue) > 0.1) {
      // Avoid inheriting tiny, insignificant karma values
      child.karma[targetId] = inheritedValue;
    }
  }
}

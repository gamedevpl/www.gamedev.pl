import { AI_DESPERATE_ATTACK_SEARCH_RADIUS, AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT } from '../ai-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { EntityId } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance } from './math-utils';
import { areFamily, getFamilyMembers } from '../entities/tribe/family-tribe-utils.ts';
import { isHostile } from './world-utils';

/**
 * Checks if a human's primary partner is procreating with another human nearby.
 * @returns The stranger the partner is procreating with, otherwise undefined.
 */
export function findPartnerProcreatingWithStranger(
  human: HumanEntity,
  gameState: IndexedWorldState,
  radius: number,
): HumanEntity | undefined {
  const potentialTargets = gameState.search.human.byRadius(human.position, radius).filter((target) => {
    return (
      target.activeAction === 'procreating' &&
      target.gender === human.gender &&
      typeof target.target === 'number' &&
      human.partnerIds?.includes(target.target)
    );
  });

  return potentialTargets[0];
}

/**
 * Finds a close family member (parent, partner, child) who is under attack by an outsider.
 * @returns An object containing the family member and the aggressor, otherwise undefined.
 */
export function findFamilyMemberUnderAttack(
  human: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): { familyMember: HumanEntity; aggressor: HumanEntity } | undefined {
  const family = getFamilyMembers(human, gameState);
  const indexedState = gameState as IndexedWorldState;

  for (const familyMember of family) {
    const distanceToFamilyMember = calculateWrappedDistance(
      human.position,
      familyMember.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distanceToFamilyMember > radius) {
      continue;
    }

    // Find anyone attacking this family member
    const potentialAggressors = indexedState.search.human.byProperty('attackTargetId', familyMember.id);
    for (const aggressor of potentialAggressors) {
      // An aggressor is from a different tribe (or has no tribe if defender has one)
      if (aggressor.leaderId !== human.leaderId) {
        const distanceToAggressor = calculateWrappedDistance(
          human.position,
          aggressor.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distanceToAggressor <= radius) {
          return { familyMember, aggressor };
        }
      }
    }
  }

  return undefined;
}

/**
 * Finds the closest, weakest, non-family human to attack out of desperation.
 * @returns The target entity, otherwise undefined.
 */
export function findWeakCannibalismTarget(human: HumanEntity, gameState: GameWorldState): HumanEntity | undefined {
  const indexedState = gameState as IndexedWorldState;
  const nearbyHumans = indexedState.search.human.byRadius(human.position, AI_DESPERATE_ATTACK_SEARCH_RADIUS);

  let bestTarget: HumanEntity | undefined = undefined;
  let minDistance = Infinity;

  for (const target of nearbyHumans) {
    if (
      target.id === human.id ||
      target.hitpoints <= 0 ||
      target.hitpoints / target.maxHitpoints > AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT ||
      areFamily(human, target, gameState)
    ) {
      continue;
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance < minDistance) {
      minDistance = distance;
      bestTarget = target;
    }
  }

  return bestTarget;
}

export function findNearbyEnemiesOfTribe(
  human: HumanEntity,
  gameState: IndexedWorldState,
  radius: number,
): HumanEntity[] {
  const nearbyHumans = gameState.search.human.byRadius(human.position, radius);
  return nearbyHumans.filter((h) => isHostile(human, h, gameState));
}

export function countTribeAttackersOnTarget(
  tribeLeaderId: EntityId,
  targetId: EntityId,
  gameState: IndexedWorldState,
): number {
  const tribeMembers = gameState.search.human.byProperty('leaderId', tribeLeaderId);
  let count = 0;
  for (const member of tribeMembers) {
    if (member.attackTargetId === targetId) {
      count++;
    }
  }
  return count;
}

export function calculateTribeStrength(tribeMembers: HumanEntity[]): number {
  return tribeMembers
    .filter((m) => m.isAdult)
    .reduce((total, member) => {
      let strength = member.hitpoints;
      strength += (member.maxAge - member.age) * 0.5; // Younger members are slightly stronger
      strength += member.food.length * 2; // Well-fed members are stronger
      return total + strength;
    }, 0);
}

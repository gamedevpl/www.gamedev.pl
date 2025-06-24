import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Entity, EntityType } from '../../entities/entities-types';
import { findClosestEntity, countEntitiesOfTypeInRadius, countLivingOffspring } from '../../utils/world-utils';
import { vectorDistance, vectorNormalize, getDirectionVectorOnTorus } from '../../utils/math-utils';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_AI_WANDER_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  KARMA_ENEMY_THRESHOLD,
  KARMA_NEUTRAL_THRESHOLD,
  HUMAN_MALE_URGENT_PROCREATION_AGE,
} from '../../world-consts';

export class ProcreationStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    const isUrgentMale =
      human.gender === 'male' &&
      human.age > HUMAN_MALE_URGENT_PROCREATION_AGE &&
      countLivingOffspring(human.id, gameState) === 0;

    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      gameState,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
    );

    const canProcreateBasically =
      human.isAdult &&
      (isUrgentMale ||
        (human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
          (human.procreationCooldown || 0) <= 0 &&
          nearbyBerryBushesCount >= PROCREATION_MIN_NEARBY_BERRY_BUSHES)) &&
      (human.gender === 'female' ? !human.isPregnant && human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true);

    if (!canProcreateBasically) {
      return null;
    }

    const partnerFilter = (p: Entity): p is HumanEntity => {
      const other = p as HumanEntity;
      const commonConditions =
        other.type === 'human' && other.id !== human.id && other.gender !== human.gender && other.isAdult;

      if (!commonConditions) return false;

      if (isUrgentMale) {
        // Urgent males have relaxed conditions for partners
        return other.gender === 'female' ? !other.isPregnant && other.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true;
      }

      // Standard conditions for non-urgent procreation
      const standardPartnerConditions =
        other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (other.procreationCooldown || 0) <= 0 &&
        (human.karma[other.id] || 0) > KARMA_NEUTRAL_THRESHOLD; // Do not procreate with non-enemies

      if (!standardPartnerConditions) return false;

      return other.gender === 'female' ? !other.isPregnant && other.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true;
    };

    // Tier 1: Find unpartnered individuals
    const unpartneredPartner = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 5,
      (p) => partnerFilter(p) && (!p.partnerIds || p.partnerIds.length === 0 || p.partnerIds.includes(human.id)), // Unpartnered or partnered with the human itself,
    );

    if (unpartneredPartner) {
      return unpartneredPartner;
    }

    if (isUrgentMale) {
      // Urgent males will not engage in infidelity as it's a complex social dynamic
      // not aligned with the simple goal of having an heir.
      return null;
    }

    // Tier 2: Consider infidelity as an aggressive move against an enemy's partner
    const partneredPartner = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 10,
      (p) => {
        if (!partnerFilter(p) || !p.partnerIds || p.partnerIds.length === 0) {
          return false;
        }
        // Check karma against the existing partner
        const existingPartnerId = p.partnerIds[0];
        return (human.karma[existingPartnerId] || 0) <= KARMA_ENEMY_THRESHOLD;
      },
    );

    return partneredPartner;
  }

  execute(human: HumanEntity, context: UpdateContext, partner: HumanEntity): void {
    if (!partner) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = vectorDistance(human.position, partner.position);
    if (distance < HUMAN_INTERACTION_RANGE / 1.5) {
      human.activeAction = 'procreating';
      human.targetPosition = partner.position;
    } else {
      human.activeAction = 'moving';
      human.targetPosition = { ...partner.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        partner.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    }
  }
}

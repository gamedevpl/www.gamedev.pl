import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Entity, EntityType } from '../../entities/entities-types';
import { findClosestEntity, countEntitiesOfTypeInRadius } from '../../utils/world-utils';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import {
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_AI_WANDER_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_FOOD_SEARCH_RADIUS,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
} from '../../world-consts';

export class ProcreationStrategy implements HumanAIStrategy {
  private findRegularPartner(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    const baseFilter = (p: Entity): p is HumanEntity => {
      const other = p as HumanEntity;
      const isFemale = other.gender === 'female';
      const isMale = other.gender === 'male';

      const commonConditions =
        other.type === 'human' &&
        other.id !== human.id &&
        other.gender !== human.gender &&
        other.isAdult &&
        other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (other.procreationCooldown || 0) <= 0;

      if (!commonConditions) return false;

      if (isFemale) {
        // Female specific conditions: not pregnant and within procreation age
        return !other.isPregnant && other.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE;
      } else if (isMale) {
        // Male specific conditions: only interested in females who are actively procreating
        // This logic is for the male's perspective when searching for a partner.
        // The female's activeAction is checked here.
        return true; //other.activeAction === 'procreating';
      }
      return false; // Should not happen if genders are opposite
    };

    // Find any eligible partner based on the updated filter
    const anyPartner = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 2,
      (p) => baseFilter(p),
    );

    return anyPartner;
  }

  check(human: HumanEntity, context: UpdateContext): boolean {
    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      context.gameState,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
    );

    const canProcreateBasically =
      human.isAdult &&
      human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (human.procreationCooldown || 0) <= 0 &&
      (human.gender === 'female' ? !human.isPregnant && human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true) &&
      nearbyBerryBushesCount >= PROCREATION_MIN_NEARBY_BERRY_BUSHES;

    if (!canProcreateBasically) {
      return false;
    }

    const partner = this.findRegularPartner(human, context);
    return !!partner;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    let partnerToPursue: HumanEntity | null = null;

    partnerToPursue = this.findRegularPartner(human, context);

    if (partnerToPursue) {
      const distance = vectorDistance(human.position, partnerToPursue.position);
      if (distance < HUMAN_INTERACTION_RANGE / 1.5) {
        human.activeAction = 'procreating';
        human.targetPosition = partnerToPursue.position;
      } else {
        human.activeAction = 'moving';
        human.targetPosition = { ...partnerToPursue.position };
        const dirToTarget = vectorSubtract(partnerToPursue.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      }
    } else {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}

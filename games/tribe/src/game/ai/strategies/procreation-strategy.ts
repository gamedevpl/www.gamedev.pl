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

export class ProcreationStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      gameState,
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
      return null;
    }

    const partnerFilter = (p: Entity): p is HumanEntity => {
      const other = p as HumanEntity;
      const commonConditions =
        other.type === 'human' &&
        other.id !== human.id &&
        other.gender !== human.gender &&
        other.isAdult &&
        other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (other.procreationCooldown || 0) <= 0;

      if (!commonConditions) return false;

      return other.gender === 'female' ? !other.isPregnant && other.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true;
    };

    return findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 2,
      partnerFilter,
    );
  }

  execute(human: HumanEntity, _: UpdateContext, partner: HumanEntity): void {
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
      const dirToTarget = vectorSubtract(partner.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    }
  }
}

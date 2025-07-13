import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findClosestEntity, countLivingOffspring } from '../../utils/world-utils';
import {
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_PROXIMITY,
  HUMAN_MALE_URGENT_PROCREATION_AGE,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
} from '../../world-consts';
import { Entity, EntityType } from '../../entities/entities-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';
import { IndexedWorldState } from '../../world-index/world-index-types';

const findPartner = (human: HumanEntity, context: UpdateContext): HumanEntity | null => {
    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const isUrgentMale =
      human.gender === 'male' &&
      human.age > HUMAN_MALE_URGENT_PROCREATION_AGE &&
      countLivingOffspring(human.id, gameState) === 0;

    const nearbyBerryBushesCount = indexedState.search.berryBush.byRadius(human.position, PROCREATION_FOOD_SEARCH_RADIUS).length;

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

      // Standard conditions for non-urgent procreation
      const standardPartnerConditions =
        other.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
        (other.procreationCooldown || 0) <= 0;

      if (!standardPartnerConditions) return false;

      return other.gender === 'female' ? !other.isPregnant && other.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE : true;
    };

    return findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      HUMAN_AI_WANDER_RADIUS * 5,
      (p) => partnerFilter(p) && (!p.partnerIds || p.partnerIds.length === 0 || p.partnerIds.includes(human.id)),
    );
}


export const procreateAction: Action = {
  type: ActionType.PROCREATE,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.PROCREATE) {
      return 0;
    }

    const partner = findPartner(human, context);

    return partner ? 0.8 : 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const partner = findPartner(human, context);
    if (!partner) {
      human.activeAction = 'idle';
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      partner.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance < HUMAN_INTERACTION_PROXIMITY) {
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
  },
};

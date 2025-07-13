import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
  PARENT_FEEDING_RANGE,
} from '../../../world-consts';
import { findClosestEntity } from '../../../utils/world-utils';
import { EntityType } from '../../../entities/entities-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';

export const seekFoodFromParentAction: Action = {
  type: ActionType.SEEK_FOOD_FROM_PARENT,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.SATISFY_HUNGER || human.isAdult) {
      return 0;
    }

    const isHungryEnough = human.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;
    if (!isHungryEnough) {
      return 0;
    }

    const parentWithFood = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (p) => (p.id === human.motherId || p.id === human.fatherId) && p.food.length > 0,
    );

    // High utility if a parent with food is available
    return parentWithFood ? 0.9 : 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const parentWithFood = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (p) => (p.id === human.motherId || p.id === human.fatherId) && p.food.length > 0,
    );

    if (parentWithFood) {
      const distance = calculateWrappedDistance(
        human.position,
        parentWithFood.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance > PARENT_FEEDING_RANGE) {
        human.activeAction = 'moving';
        human.targetPosition = { ...parentWithFood.position };
        const dirToTarget = getDirectionVectorOnTorus(
          human.position,
          parentWithFood.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Close enough, wait for feeding
        human.activeAction = 'seekingFood';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
    } else {
      // No parent with food found, default to idle
      human.activeAction = 'idle';
    }
  },
};

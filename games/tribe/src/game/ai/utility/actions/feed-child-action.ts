import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
} from '../../../world-consts';
import { findClosestEntity } from '../../../utils/world-utils';
import { EntityType } from '../../../entities/entities-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';

export const feedChildAction: Action = {
  type: ActionType.FEED_CHILD,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.FEED_CHILDREN) {
      return 0;
    }

    // Basic conditions for a parent to be able to feed a child.
    if (!human.isAdult || human.food.length <= 0 || (human.feedChildCooldownTime && human.feedChildCooldownTime > 0)) {
      return 0;
    }

    // Check if there is a hungry child nearby.
    const hungryChild = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (entity) => {
        const childEntity = entity as HumanEntity;
        return (
          !childEntity.isAdult &&
          (childEntity.motherId === human.id || childEntity.fatherId === human.id) &&
          childEntity.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
        );
      },
    );

    // If a hungry child is found, this action has high utility.
    return hungryChild ? 1 : 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    // Find the hungry child again to execute the action.
    const hungryChild = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (entity) => {
        const childEntity = entity as HumanEntity;
        return (
          !childEntity.isAdult &&
          (childEntity.motherId === human.id || childEntity.fatherId === human.id) &&
          childEntity.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
        );
      },
    );

    if (!hungryChild) {
      // Should not happen if utility was > 0, but as a safeguard.
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      hungryChild.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > PARENT_FEEDING_RANGE) {
      // Move towards the child if not in range.
      human.activeAction = 'moving';
      human.targetPosition = { ...hungryChild.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        hungryChild.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    } else {
      // If in range, become idle. The `human-child-feeding-interaction` will handle the actual feeding.
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  },
};

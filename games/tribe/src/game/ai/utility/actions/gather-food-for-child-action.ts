import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findClosestEntity, findChildren } from '../../../utils/world-utils';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_INTERACTION_PROXIMITY } from '../../../world-consts';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../../entities/characters/human/human-corpse-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

// Helper to find the best food source
const findBestFoodSource = (human: HumanEntity, context: UpdateContext): FoodSource | null => {
  const { gameState } = context;

  const findFood = (radius?: number) => {
    const closestBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState,
      'berryBush',
      radius,
      (b) => b.food.length > 0,
    );
    const closestCorpse = findClosestEntity<HumanCorpseEntity>(
      human,
      gameState,
      'humanCorpse',
      radius,
      (c) => c.food.length > 0,
    );

    if (closestBush && closestCorpse) {
      const distBush = calculateWrappedDistance(
        human.position,
        closestBush.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      const distCorpse = calculateWrappedDistance(
        human.position,
        closestCorpse.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      return distBush <= distCorpse ? closestBush : closestCorpse;
    }
    return closestBush || closestCorpse;
  };

  return findFood(); // Global search
};

export const gatherFoodForChildAction: Action = {
  type: ActionType.GATHER_FOOD_FOR_CHILD,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.FEED_CHILDREN || !human.isAdult || human.food.length > 0) {
      return 0;
    }

    const hungryChildren = findChildren(context.gameState, human).filter(
      (child) => !child.isAdult && child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
    );

    if (hungryChildren.length === 0) {
      return 0;
    }

    // If there's a hungry child and the parent has no food, this action is highly relevant.
    const foodSource = findBestFoodSource(human, context);
    return foodSource ? 0.8 : 0; // High utility if a food source exists
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const foodSource = findBestFoodSource(human, context);

    if (!foodSource) {
      human.activeAction = 'idle';
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      foodSource.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance < HUMAN_INTERACTION_PROXIMITY) {
      human.activeAction = 'gathering';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    } else {
      human.activeAction = 'moving';
      human.targetPosition = { ...foodSource.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        foodSource.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    }
  },
};

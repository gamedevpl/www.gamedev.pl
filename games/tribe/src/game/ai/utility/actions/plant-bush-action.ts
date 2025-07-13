import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { BERRY_COST_FOR_PLANTING, HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING } from '../../../world-consts';
import { findOptimalBushPlantingSpot } from '../../../utils/world-utils';
import { FoodType } from '../../../food/food-types';

export const plantBushAction: Action = {
  type: ActionType.PLANT_BUSH,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.PLANT_BUSHES) {
      return 0;
    }

    const hasEnoughBerries = human.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING;
    const isNotTooHungry = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING;

    if (!isNotTooHungry || !hasEnoughBerries) {
      return 0;
    }

    const plantingSpot = findOptimalBushPlantingSpot(human, context.gameState);
    if (plantingSpot) {
      // High utility if we can plant.
      return 0.8;
    }

    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const plantingSpot = findOptimalBushPlantingSpot(human, context.gameState);
    if (plantingSpot) {
      human.activeAction = 'planting';
      human.targetPosition = plantingSpot;
    }
  },
};

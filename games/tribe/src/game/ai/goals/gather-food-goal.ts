import { HumanEntity } from '../../entities/characters/human/human-types';
import { HUMAN_HUNGER_DEATH } from '../../world-consts';
import { UpdateContext } from '../../world-types';
import { findChildren } from '../../utils/world-utils';
import { Goal, GoalType } from './goal-types';

/**
 * Represents the goal to gather and store food.
 * The score is influenced by the amount of food carried, current hunger,
 * and the presence of children.
 */
export const gatherFoodGoal: Goal = {
  type: GoalType.GATHER_FOOD,

  /**
   * Calculates the urgency of gathering food.
   * @param human The human entity to evaluate for.
   * @param context The current game update context.
   * @returns A score from 0 upwards, representing the urgency to gather food.
   */
  getScore(human: HumanEntity, context: UpdateContext): number {
    // Children do not gather food themselves.
    if (!human.isAdult) {
      return 0;
    }

    // If inventory is full, there's no need to gather.
    if (human.food.length >= human.maxFood) {
      return 0;
    }

    // The primary driver is how empty the inventory is.
    const inventoryScore = 1 - human.food.length / human.maxFood;

    // Urgency increases with personal hunger.
    const hungerScore = human.hunger / HUMAN_HUNGER_DEATH;

    // Urgency also increases if there are children to feed.
    const children = findChildren(context.gameState, human);
    const childUrgency = children.length > 0 ? 0.2 * children.length : 0;

    // Combine the scores. The need to fill the inventory is fundamental,
    // and it's amplified by personal hunger and the need to feed children.
    const totalScore = inventoryScore + hungerScore + childUrgency;

    return Math.max(0, Math.min(totalScore, 1)); // Clamp between 0 and 1
  },
};

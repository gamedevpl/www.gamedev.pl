import { HumanEntity } from '../../../entities/characters/human/human-types';
import {
  BERRY_COST_FOR_PLANTING,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  MAX_BUSHES_PER_TRIBE_TERRITORY,
} from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';
import { FoodType } from '../../../food/food-types';
import { findTribeMembers } from '../../../utils/world-utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';

/**
 * Represents the goal to plant new berry bushes to expand the tribe's food source.
 */
export const plantBushesGoal: Goal = {
  type: GoalType.PLANT_BUSHES,

  /**
   * Calculates the urgency of planting a new bush.
   * The score is high if the tribe has few bushes and the human has enough berries.
   * @param human The human entity to evaluate for.
   * @param context The current game update context.
   * @returns A score from 0 to 1 representing the urgency of planting.
   */
  getScore(human: HumanEntity, context: UpdateContext): number {
    if (!human.isAdult || !human.leaderId) {
      return 0;
    }

    const berryCount = human.food.filter((f) => f.type === FoodType.Berry).length;
    if (berryCount < BERRY_COST_FOR_PLANTING) {
      return 0;
    }

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING) {
      return 0;
    }

    const tribeMembers = findTribeMembers(human.leaderId, context.gameState);
    const tribeMemberIds = new Set(tribeMembers.map((m) => m.id));

    const indexedState = context.gameState as IndexedWorldState;
    const allBushes = Array.from(indexedState.entities.entities.values()).filter(
      (e) => e.type === 'berryBush',
    ) as BerryBushEntity[];

    const tribeBushCount = allBushes.filter((b) => b.ownerId && tribeMemberIds.has(b.ownerId)).length;

    if (tribeBushCount >= MAX_BUSHES_PER_TRIBE_TERRITORY) {
      return 0;
    }

    // The score is higher when the number of bushes is lower.
    const score = 1 - tribeBushCount / MAX_BUSHES_PER_TRIBE_TERRITORY;

    return Math.max(0, Math.min(score, 1));
  },
};

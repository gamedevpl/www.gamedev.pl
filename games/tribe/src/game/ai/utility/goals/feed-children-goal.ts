import { HumanEntity } from '../../../entities/characters/human/human-types';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_HUNGER_DEATH } from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';
import { findChildren } from '../../../utils/world-utils';

/**
 * Represents the goal for a parent to feed their hungry children.
 * The score is determined by the hunger level of the hungriest child.
 */
export class FeedChildrenGoal implements Goal {
  public type = GoalType.FEED_CHILDREN;

  public getScore(human: HumanEntity, context: UpdateContext): number {
    if (!human.isAdult || human.food.length === 0) {
      return 0;
    }

    const children = findChildren(context.gameState, human);
    if (children.length === 0) {
      return 0;
    }

    let maxHunger = 0;
    for (const child of children) {
      if (child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD) {
        if (child.hunger > maxHunger) {
          maxHunger = child.hunger;
        }
      }
    }

    if (maxHunger === 0) {
      return 0;
    }

    // The score is the normalized hunger of the hungriest child.
    return maxHunger / HUMAN_HUNGER_DEATH;
  }
}

export const feedChildrenGoal = new FeedChildrenGoal();

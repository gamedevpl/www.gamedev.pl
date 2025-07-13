import { HumanEntity } from '../../entities/characters/human/human-types';
import { HUMAN_HUNGER_DEATH } from '../../world-consts';
import { Goal, GoalType } from './goal-types';

/**
 * Represents the goal to satisfy hunger.
 * The score of this goal is directly proportional to the human's hunger level.
 */
export class SatisfyHungerGoal implements Goal {
  public type = GoalType.SATISFY_HUNGER;

  /**
   * Calculates the urgency of the hunger goal.
   * The score is a value between 0 and 1, where 1 is maximum hunger.
   * @param human The human entity to evaluate for.
   * @param _context The current game update context.
   * @returns A score from 0 to 1 representing the urgency of hunger.
   */
  public getScore(human: HumanEntity): number {
    // Normalize the hunger value to a 0-1 scale.
    // A score of 0 means not hungry at all.
    // A score close to 1 means critically hungry.
    const score = human.hunger / HUMAN_HUNGER_DEATH;
    return Math.max(0, Math.min(score, 1)); // Clamp between 0 and 1
  }
}

export const satisfyHungerGoal = new SatisfyHungerGoal();

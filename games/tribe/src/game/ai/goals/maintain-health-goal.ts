import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Goal, GoalType } from './goal-types';

/**
 * Represents the goal to maintain health.
 * The score is inversely proportional to the human's current health percentage.
 */
export const maintainHealthGoal: Goal = {
  type: GoalType.MAINTAIN_HEALTH,

  /**
   * Calculates the urgency of maintaining health.
   * A score of 0 means full health.
   * A score close to 1 means very low health.
   * @param human The human entity to evaluate for.
   * @param _context The current game update context.
   * @returns A score from 0 to 1 representing the urgency of healing or avoiding damage.
   */
  getScore(human: HumanEntity, _context: UpdateContext): number {
    const healthPercentage = human.hitpoints / human.maxHitpoints;
    const score = 1 - healthPercentage;
    return Math.max(0, Math.min(score, 1)); // Clamp between 0 and 1
  }
};

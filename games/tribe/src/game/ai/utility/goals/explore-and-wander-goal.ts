import { Goal, GoalType } from './goal-types';

/**
 * Represents the goal to explore the world or wander idly.
 * This goal typically has a low, constant score to act as a fallback
 * when no other goals are pressing.
 */
export const exploreAndWanderGoal: Goal = {
  type: GoalType.EXPLORE_AND_WANDER,

  /**
   * Returns a constant low score, making it a default action.
   * @param human The human entity to evaluate for.
   * @param _context The current game update context.
   * @returns A constant low score.
   */
  getScore(): number {
    // This goal serves as a fallback, so it always has a low score.
    // It ensures the AI does something when no other needs are urgent.
    return 0.05;
  },
};

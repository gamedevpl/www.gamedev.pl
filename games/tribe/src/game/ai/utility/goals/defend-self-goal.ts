import { findClosestAggressor } from '../../../utils/world-utils';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';

/**
 * Represents the goal to defend oneself from an immediate threat.
 * The score is based on being attacked and the human's current health.
 */
class DefendSelfGoal implements Goal {
  public type = GoalType.DEFEND_SELF;

  public getScore(human: HumanEntity, context: UpdateContext): number {
    const aggressor = findClosestAggressor(human.id, context.gameState);

    if (!aggressor) {
      // Not being attacked, no need to defend.
      return 0;
    }

    // The lower the health, the more urgent this goal becomes.
    // Score ranges from 0.1 (at full health) to 1.0 (at zero health).
    const healthUrgency = 1 - human.hitpoints / human.maxHitpoints;

    // Being attacked is always a high-priority situation.
    // We give it a base score and add the health urgency.
    const baseScore = 0.5;

    return Math.min(1, baseScore + healthUrgency * 0.5);
  }
}

export const defendSelfGoal = new DefendSelfGoal();

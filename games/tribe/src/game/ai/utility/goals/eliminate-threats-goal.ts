import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';
import { findNearbyEnemiesOfTribe } from '../../../utils/world-utils';
import { AI_ATTACK_ENEMY_RANGE } from '../../../world-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';

/**
 * Represents the goal to eliminate threats.
 * The score is high if there are enemies nearby.
 */
class EliminateThreatsGoal implements Goal {
  public type = GoalType.ELIMINATE_THREATS;

  public getScore(human: HumanEntity, context: UpdateContext): number {
    if (!human.leaderId) {
      // Non-tribe members don't actively seek to eliminate threats in the same way
      return 0;
    }

    const enemies = findNearbyEnemiesOfTribe(
      human.position,
      human.leaderId,
      context.gameState as IndexedWorldState,
      AI_ATTACK_ENEMY_RANGE,
    );

    return enemies.length > 0 ? 1 : 0;
  }
}

export const eliminateThreatsGoal = new EliminateThreatsGoal();

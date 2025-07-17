import { HumanEntity } from '../../../entities/characters/human/human-types';
import { getTribeForLeader, isTribeUnderAttack } from '../../../utils/world-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';

class DefendTribeGoal implements Goal {
  public type = GoalType.DEFEND_TRIBE;

  public getScore(human: HumanEntity, context: UpdateContext): number {
    if (!human.leaderId) {
      // Not in a tribe, cannot defend it.
      return 0;
    }

    const indexedState = context.gameState as IndexedWorldState;
    const tribeMembers = getTribeForLeader(human.leaderId, indexedState);

    if (isTribeUnderAttack(tribeMembers, indexedState)) {
      // If any tribe member is under attack, this goal becomes highly important.
      return 1;
    }

    return 0;
  }
}

export const defendTribeGoal = new DefendTribeGoal();

import { HumanEntity } from '../../entities/characters/human/human-types';
import { FlagEntity } from '../../entities/flag/flag-types';
import { UpdateContext } from '../../world-types';
import { findClosestEntity } from '../../utils/world-utils';
import { AI_RECLAIM_FLAG_RANGE, KARMA_ENEMY_THRESHOLD } from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { IndexedWorldState } from '../../world-index/world-index-types';

export class ReclaimingStrategy implements HumanAIStrategy<FlagEntity> {
  check(human: HumanEntity, context: UpdateContext): FlagEntity | null {
    const { gameState } = context;

    // Only adult leaders can initiate a reclaim action
    if (human.leaderId !== human.id || !human.isAdult) {
      return null;
    }

    // Find the closest enemy flag
    const enemyFlag = findClosestEntity<FlagEntity>(human, gameState, 'flag', AI_RECLAIM_FLAG_RANGE, (flag) => {
      if (flag.leaderId === human.leaderId) {
        return false; // Not an enemy flag
      }
      const flagOwner = gameState.entities.entities.get(flag.leaderId) as HumanEntity | undefined;
      // Check if the flag owner is an enemy
      return flagOwner ? (human.karma[flagOwner.id] ?? 0) < KARMA_ENEMY_THRESHOLD : true;
    });

    if (!enemyFlag) {
      return null;
    }

    const indexedState = gameState as IndexedWorldState;

    // Simple check: do we have more local tribe members than enemies near the flag?
    const tribeMembersNearFlag = indexedState.search.human
      .byRadius(enemyFlag.position, 100)
      .filter((h) => h.leaderId === human.leaderId).length;
    const enemiesNearFlag = indexedState.search.human
      .byRadius(enemyFlag.position, 100)
      .filter((h) => h.leaderId !== human.leaderId).length;

    if (tribeMembersNearFlag > enemiesNearFlag) {
      return enemyFlag;
    }

    return null;
  }

  execute(human: HumanEntity, _context: UpdateContext, flagToReclaim: FlagEntity): void {
    // The leader assigns the task. For simplicity, the leader themself will go.
    // A more complex system could assign this task to a nearby idle tribe member.
    human.activeAction = 'reclaiming';
    human.targetPosition = flagToReclaim.position;
  }
}

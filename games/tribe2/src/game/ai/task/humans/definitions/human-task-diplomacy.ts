import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../human-task-utils';
import { findTribeMembers, getTribesInfo } from '../../../../utils';
import { calculateTribeStrength } from '../../../../utils/ai-world-analysis-utils';
import { LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD } from '../../../../ai-consts';
import { DiplomacyStatus } from '../../../../world-types';
import { Blackboard } from '../../../behavior-tree/behavior-tree-blackboard';

/**
 * Task definition for tribe leaders to manage diplomatic relations.
 * This task is executed by the leader to periodically assess other tribes
 * and decide on a Friendly or Hostile status.
 */
export const humanDiplomacyDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanDiplomacy,
  requireAdult: true,
  scorer: (human, task) => {
    // Only the tribe leader can claim their own diplomacy task
    if (human.id === human.leaderId && task.creatorEntityId === human.id) {
      return 1.0;
    }
    return null;
  },
  executor: (_task, leader, context) => {
    const { gameState } = context;

    // Assess diplomatic relations with other tribes
    const playerTribe = findTribeMembers(leader.id, gameState);
    const playerTribeStrength = calculateTribeStrength(playerTribe);

    const otherTribes = getTribesInfo(gameState).filter((t) => t.leaderId !== leader.id);

    for (const otherTribeInfo of otherTribes) {
      const otherTribeMembers = findTribeMembers(otherTribeInfo.leaderId, gameState);
      const otherTribeStrength = calculateTribeStrength(otherTribeMembers);

      const currentStatus = leader.tribeControl?.diplomacy?.[otherTribeInfo.leaderId] || DiplomacyStatus.Friendly;
      const otherLeader = gameState.entities.entities[otherTribeInfo.leaderId] as HumanEntity | undefined;
      const isOtherHostile = otherLeader?.tribeControl?.diplomacy?.[leader.id] === DiplomacyStatus.Hostile;

      // Become hostile if they are hostile to us OR if we are much stronger.
      if (
        isOtherHostile ||
        playerTribeStrength > otherTribeStrength * LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD
      ) {
        if (currentStatus !== DiplomacyStatus.Hostile && leader.tribeControl?.diplomacy) {
          leader.tribeControl.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Hostile;
        }
      } else {
        if (currentStatus !== DiplomacyStatus.Friendly && leader.tribeControl?.diplomacy) {
          leader.tribeControl.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Friendly;
        }
      }
    }

    // Record the check time in the leader's blackboard to enforce cooldown in the producer
    if (leader.aiBlackboard) {
      Blackboard.set(leader.aiBlackboard, 'lastDiplomacyCheckTime', gameState.time);
    }

    return TaskResult.Success;
  },
});

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, DiplomacyStatus } from '../../../world-types';
import { findTribeMembers, calculateTribeStrength, getTribesInfo } from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, CooldownNode } from '../nodes';
import {
  AI_DIPLOMACY_CHECK_INTERVAL_HOURS,
  LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD,
} from '../../../ai-consts.ts';

/**
 * Creates a behavior for a tribe leader to manage diplomatic relations with other tribes.
 * The leader will periodically assess the situation and may change diplomatic status
 * from Friendly to Hostile based on factors like relative strength and resource needs.
 */
export function createDiplomacyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const isLeader = new ConditionNode<HumanEntity>((human) => human.id === human.leaderId, 'Is Leader?', depth + 1);

  const evaluateAndSetDiplomacy = new ActionNode(
    (leader: HumanEntity, context: UpdateContext) => {
      const { gameState } = context;
      const playerTribe = findTribeMembers(leader.id, gameState);
      const playerTribeStrength = calculateTribeStrength(playerTribe);

      const otherTribes = getTribesInfo(gameState).filter((t) => t.leaderId !== leader.id);

      for (const otherTribeInfo of otherTribes) {
        const otherTribeMembers = findTribeMembers(otherTribeInfo.leaderId, gameState);
        const otherTribeStrength = calculateTribeStrength(otherTribeMembers);

        const currentStatus = leader.diplomacy?.[otherTribeInfo.leaderId] || DiplomacyStatus.Friendly;

        // Simple logic: Become hostile if much stronger, otherwise become friendly.
        if (playerTribeStrength > otherTribeStrength * LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD) {
          if (currentStatus !== DiplomacyStatus.Hostile && leader.diplomacy) {
            leader.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Hostile;
          }
        } else {
          if (currentStatus !== DiplomacyStatus.Friendly && leader.diplomacy) {
            leader.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Friendly;
          }
        }
      }

      return NodeStatus.SUCCESS;
    },
    'Evaluate Diplomacy',
    depth + 2,
  );

  return new Sequence(
    [
      isLeader,
      new CooldownNode(AI_DIPLOMACY_CHECK_INTERVAL_HOURS, evaluateAndSetDiplomacy, 'Diplomacy Cooldown', depth + 1),
    ],
    'Manage Diplomacy',
    depth,
  );
}

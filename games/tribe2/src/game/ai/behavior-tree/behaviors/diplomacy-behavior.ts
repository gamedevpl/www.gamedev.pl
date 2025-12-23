import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, DiplomacyStatus } from '../../../world-types';
import { findTribeMembers, calculateTribeStrength, getTribesInfo, getTribeCenter } from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, CooldownNode } from '../nodes';
import {
  AI_DIPLOMACY_CHECK_INTERVAL_HOURS,
  LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD,
  AI_DIPLOMACY_HOSTILITY_DISTANCE_THRESHOLD,
  AI_DIPLOMACY_MIN_TRIBE_SIZE_FOR_HOSTILITY,
} from '../../../ai-consts.ts';
import { calculateWrappedDistance } from '../../../utils/math-utils';

/**
 * Creates a behavior for a tribe leader to manage diplomatic relations with other tribes.
 * The leader will periodically assess the situation and may change diplomatic status
 * from Friendly to Hostile based on factors like relative strength, proximity, and resource needs.
 */
export function createDiplomacyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const isLeader = new ConditionNode<HumanEntity>((human) => human.id === human.leaderId, 'Is Leader?', depth + 1);

  const evaluateAndSetDiplomacy = new ActionNode(
    (leader: HumanEntity, context: UpdateContext) => {
      const { gameState } = context;
      const playerTribe = findTribeMembers(leader.id, gameState);
      const playerTribeStrength = calculateTribeStrength(playerTribe);
      const leaderTribeCenter = getTribeCenter(leader.id, gameState);
      // Count adults without creating a new array
      let playerTribeAdults = 0;
      for (const m of playerTribe) {
        if (m.isAdult) playerTribeAdults++;
      }

      const otherTribes = getTribesInfo(gameState).filter((t) => t.leaderId !== leader.id);

      for (const otherTribeInfo of otherTribes) {
        const otherTribeMembers = findTribeMembers(otherTribeInfo.leaderId, gameState);
        const otherTribeStrength = calculateTribeStrength(otherTribeMembers);
        const otherTribeCenter = getTribeCenter(otherTribeInfo.leaderId, gameState);

        const currentStatus = leader.tribeControl?.diplomacy?.[otherTribeInfo.leaderId] || DiplomacyStatus.Friendly;

        // Calculate distance between tribe centers
        const distanceBetweenTribes = calculateWrappedDistance(
          leaderTribeCenter,
          otherTribeCenter,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        // Hostility conditions:
        // 1. Tribes must be close enough to compete for resources
        // 2. Our tribe must have minimum adult population to sustain conflict
        // 3. Our tribe must be significantly stronger than the other
        const isCloseEnoughForConflict = distanceBetweenTribes < AI_DIPLOMACY_HOSTILITY_DISTANCE_THRESHOLD;
        const hasSufficientPopulation = playerTribeAdults >= AI_DIPLOMACY_MIN_TRIBE_SIZE_FOR_HOSTILITY;
        const isStrongerEnough =
          playerTribeStrength > otherTribeStrength * LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD;

        if (isCloseEnoughForConflict && hasSufficientPopulation && isStrongerEnough) {
          if (currentStatus !== DiplomacyStatus.Hostile && leader.tribeControl?.diplomacy) {
            leader.tribeControl.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Hostile;
          }
        } else {
          if (currentStatus !== DiplomacyStatus.Friendly && leader.tribeControl?.diplomacy) {
            leader.tribeControl.diplomacy[otherTribeInfo.leaderId] = DiplomacyStatus.Friendly;
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

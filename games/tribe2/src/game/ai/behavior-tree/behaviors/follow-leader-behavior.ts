import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { FOLLOW_LEADER_MIN_HUNGER_THRESHOLD, LEADER_FOLLOW_RADIUS } from '../../../ai-consts.ts';

/**
 * Creates a behavior for a non-leader human to follow their leader if the leader
 * has issued a "Follow Me" command and the follower's basic needs are met.
 */
export function createFollowLeaderBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is this human a follower in a tribe?
      new ConditionNode(
        (human: HumanEntity) => !!human.leaderId && human.leaderId !== human.id,
        'Is Follower',
        depth + 1,
      ),

      // 2. Condition: Is the leader calling to follow?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.leaderId) return false;
          const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
          return !!leader && leader.isCallingToFollow === true;
        },
        'Is Leader Calling To Follow',
        depth + 1,
      ),

      // 3. Condition: Is the follower not critically hungry?
      new ConditionNode(
        (human: HumanEntity) => human.hunger < FOLLOW_LEADER_MIN_HUNGER_THRESHOLD,
        'Is Not Critically Hungry',
        depth + 1,
      ),

      // 4. Action: Move towards the leader or idle if close enough.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.leaderId) {
            return NodeStatus.FAILURE; // Should not happen due to conditions, but safe guard.
          }
          const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;

          if (!leader) {
            return NodeStatus.FAILURE; // Leader is gone.
          }

          const distance = calculateWrappedDistance(
            human.position,
            leader.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance > LEADER_FOLLOW_RADIUS) {
            human.activeAction = 'moving';
            human.target = leader.id;
            // The human-moving-state will calculate the direction, but we can set it here for immediate response.
            human.direction = dirToTarget(human.position, leader.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          } else {
            // Arrived at the leader's side. If we were moving to follow, stop.
            if (human.activeAction === 'moving' && human.target === leader.id) {
              human.activeAction = 'idle';
              human.target = undefined;
            }
            return NodeStatus.SUCCESS;
          }
        },
        'Execute Follow Leader',
        depth + 1,
      ),
    ],
    'Follow Leader Command',
    depth,
  );
}

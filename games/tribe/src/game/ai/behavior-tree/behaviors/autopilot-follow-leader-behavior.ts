import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { FATHER_FOLLOW_STOP_DISTANCE } from '../../../world-consts';
import { PlayerActionType } from '../../../ui/ui-types';

/**
 * Creates a behavior that moves the player to their leader when commanded
 * via the autopilot system.
 */
export function createAutopilotFollowLeaderBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is there an active AutopilotFollowMe command?
      new ConditionNode(
        (human, context) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return (
            human.isPlayer === true &&
            context.gameState.autopilotControls.isActive &&
            activeAction?.action === PlayerActionType.AutopilotFollowMe
          );
        },
        'Has Autopilot Follow Command',
        depth + 1,
      ),

      // 2. Action: Execute the follow action.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          if (activeAction?.action !== PlayerActionType.AutopilotFollowMe) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const targetId = activeAction.targetEntityId;
          const leader = context.gameState.entities.entities.get(targetId) as HumanEntity | undefined;

          // Target is invalid (not a leader or gone), clear the command.
          if (!leader || leader.type !== 'human' || leader.id !== leader.leaderId) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            leader.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= FATHER_FOLLOW_STOP_DISTANCE) {
            // Arrived, clear command.
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            if (human.activeAction === 'moving') {
              human.activeAction = 'idle';
            }
            return NodeStatus.SUCCESS;
          } else {
            // Move towards leader.
            human.activeAction = 'moving';
            human.target = leader.id;
            human.direction = dirToTarget(human.position, leader.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Execute Autopilot Follow',
        depth + 1,
      ),
    ],
    'Autopilot Follow Leader',
    depth,
  );
}

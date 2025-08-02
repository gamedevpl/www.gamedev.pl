import {
  AUTOPILOT_MOVE_DISTANCE_THRESHOLD
} from '../../../ai-consts.ts';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { PlayerActionType } from '../../../ui/ui-types';

/**
 * Creates a behavior tree branch that moves the human to a player-commanded
 * target location when autopilot is active.
 *
 * The behavior is structured as a Sequence:
 * 1. Condition: Check if an AutopilotMove action is active.
 * 2. Action: Move towards the target, clearing the action upon arrival.
 */
export function createAutopilotMovingBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is there an active AutopilotMove command?
      new ConditionNode(
        (human, context) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return human.isPlayer === true && activeAction?.action === PlayerActionType.AutopilotMove;
        },
        'Has Autopilot Move Command',
        depth + 1,
      ),

      // 2. Action: Execute the move.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          // Guard against action changing between condition and action execution
          if (activeAction?.action !== PlayerActionType.AutopilotMove) {
            // Action was cleared or changed by another process, so we fail.
            if (human.activeAction === 'moving' && typeof human.target === 'object') {
              // If we were moving to a position target, stop.
              human.activeAction = 'idle';
              human.target = undefined;
            }
            return NodeStatus.FAILURE;
          }

          const targetPosition = activeAction.position;

          const distance = calculateWrappedDistance(
            human.position,
            targetPosition,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Check if we have arrived.
          if (distance < AUTOPILOT_MOVE_DISTANCE_THRESHOLD) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            if (human.activeAction === 'moving') {
              human.activeAction = 'idle';
              human.target = undefined;
            }
            return NodeStatus.SUCCESS;
          }

          // Still moving towards the target.
          human.activeAction = 'moving';
          human.target = targetPosition;
          // The human-moving-state will calculate the direction, but we can set it here for immediate response.
          human.direction = dirToTarget(human.position, targetPosition, context.gameState.mapDimensions);
          return NodeStatus.RUNNING;
        },
        'Execute Autopilot Move',
        depth + 1,
      ),
    ],
    'Autopilot Move To Target',
    depth,
  );
}

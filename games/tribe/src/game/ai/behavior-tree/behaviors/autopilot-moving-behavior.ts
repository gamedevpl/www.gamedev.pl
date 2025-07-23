import { AUTOPILOT_MOVE_DISTANCE_THRESHOLD } from '../../../world-consts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';

/**
 * Creates a behavior tree branch that moves the human to a player-commanded
 * target location when autopilot is active.
 *
 * The behavior is structured as a Sequence:
 * 1. Condition: Check if an autopilot move target is set in the game state.
 * 2. Action: Set the human's action to 'moving' and assign the target.
 * 3. Action: Continuously check the distance to the target.
 *    - Return RUNNING while the human is moving towards the target.
 *    - Return SUCCESS and clear the target from the game state once arrived.
 */
export function createAutopilotMovingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human, context) => human.isPlayer === true && context.gameState.autopilotControls.isActive,
        'Is Autopilot Active?',
        depth + 1,
      ),
      // 1. Condition: Is there a move target?
      new ConditionNode(
        (_human, context) => {
          return [
            !!context.gameState.autopilotControls.autopilotMoveTarget,
            `Target: ${JSON.stringify(context.gameState.autopilotControls.autopilotMoveTarget)}`,
          ];
        },
        'Has Autopilot Move Target',
        depth + 1,
      ),

      // 2. Action: Set the human's state to move towards the target.
      new ActionNode(
        (human, context) => {
          const target = context.gameState.autopilotControls.autopilotMoveTarget;
          // This check is redundant due to the ConditionNode, but it's a good safeguard.
          if (!target) {
            return [NodeStatus.FAILURE, 'Target disappeared unexpectedly'];
          }
          human.activeAction = 'moving';
          human.target = target;
          return [NodeStatus.SUCCESS, `Set target to ${target.x.toFixed(0)},${target.y.toFixed(0)}`];
        },
        'Set Autopilot Move Action',
        depth + 1,
      ),

      // 3. Action: Check if arrived at the target.
      new ActionNode(
        (human, context) => {
          const target = context.gameState.autopilotControls.autopilotMoveTarget;

          // If target was cleared by another process, we succeed.
          if (!target) {
            if (human.activeAction === 'moving') {
              human.activeAction = 'idle';
            }
            return [NodeStatus.SUCCESS, 'Target cleared externally'];
          }

          const distance = calculateWrappedDistance(
            human.position,
            target,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Check if we have arrived.
          if (distance < AUTOPILOT_MOVE_DISTANCE_THRESHOLD) {
            context.gameState.autopilotControls.autopilotMoveTarget = undefined;
            human.target = undefined;
            if (human.activeAction === 'moving') {
              human.activeAction = 'idle';
            }
            return [NodeStatus.SUCCESS, 'Arrived at autopilot target'];
          }

          // Still moving towards the target.
          return [NodeStatus.RUNNING, `Moving to target, ${distance.toFixed(0)}px away`];
        },
        'Check Arrival at Autopilot Target',
        depth + 1,
      ),
    ],
    'Autopilot Move To Target',
    depth,
  );
}

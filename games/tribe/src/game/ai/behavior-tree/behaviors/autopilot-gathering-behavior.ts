import { HUMAN_INTERACTION_PROXIMITY } from '../../../world-consts';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { PlayerActionType } from '../../../ui/ui-types';

/**
 * Creates a behavior that moves the human to a player-commanded gather target (e.g., a berry bush)
 * and initiates gathering when in autopilot mode.
 */
export function createAutopilotGatheringBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is there an active AutopilotGather command for the player?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return human.isPlayer === true && activeAction?.action === PlayerActionType.AutopilotGather;
        },
        'Has Autopilot Gather Command',
        depth + 1,
      ),

      // 2. Action: Validate the target and execute the move/gather action.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          // Guard: Action should be AutopilotGather, but check just in case.
          if (activeAction?.action !== PlayerActionType.AutopilotGather) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const targetId = activeAction.targetEntityId;
          const targetBush = context.gameState.entities.entities.get(targetId) as BerryBushEntity | undefined;

          // If the target is gone or has no food, invalidate the command.
          if (!targetBush || targetBush.food.length === 0) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            targetBush.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance > HUMAN_INTERACTION_PROXIMITY) {
            // Move towards the target.
            human.activeAction = 'moving';
            human.target = targetId;
            human.direction = dirToTarget(human.position, targetBush.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          } else {
            // Arrived. Initiate gathering.
            human.activeAction = 'gathering';
            human.target = targetId;
            // Clear the command to prevent re-triggering.
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            // The interaction system will handle the rest. Succeed to let other behaviors run.
            return NodeStatus.SUCCESS;
          }
        },
        'Execute Autopilot Gather',
        depth + 1,
      ),
    ],
    'Autopilot Gather From Target',
    depth,
  );
}

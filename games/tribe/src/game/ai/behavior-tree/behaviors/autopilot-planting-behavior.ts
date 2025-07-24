import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../../../world-consts';
import { isPositionOccupied } from '../../../utils/world-utils';
import { PlayerActionType } from '../../../ui/ui-types';

export function createAutopilotPlantingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return (
            human.isPlayer === true &&
            context.gameState.autopilotControls.isActive &&
            activeAction?.action === PlayerActionType.AutopilotPlant
          );
        },
        'Has Autopilot Plant Command',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          if (activeAction?.action !== PlayerActionType.AutopilotPlant) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          // If already planting (from a previous tick), we just return RUNNING to keep the state machine active.
          if (human.activeAction === 'planting') {
            return NodeStatus.RUNNING;
          }

          const plantTarget = activeAction.position;

          // Check if the spot is now occupied
          if (isPositionOccupied(plantTarget, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            plantTarget,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
            human.activeAction = 'planting';
            human.target = plantTarget;
            // Clear the command, but the action continues.
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.RUNNING; // Planting takes time, so we run until the state machine changes it
          } else {
            human.activeAction = 'moving';
            human.target = plantTarget;
            human.direction = dirToTarget(human.position, plantTarget, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Execute Autopilot Plant',
        depth + 1,
      ),
    ],
    'Autopilot Plant',
    depth,
  );
}

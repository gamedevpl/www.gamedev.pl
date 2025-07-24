import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../../../world-consts';
import { isPositionOccupied } from '../../../utils/world-utils';

export function createAutopilotPlantingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity) => {
          return !!human.autopilotPlantTarget;
        },
        'Has Autopilot Plant Target',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (human.activeAction === 'planting') {
            // If already planting, we just return RUNNING to keep the state machine active.
            return NodeStatus.RUNNING;
          }

          const plantTarget = human.autopilotPlantTarget;
          if (!plantTarget) {
            return NodeStatus.FAILURE;
          }

          // Check if the spot is now occupied
          if (isPositionOccupied(plantTarget, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
            human.autopilotPlantTarget = undefined;
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
            human.autopilotPlantTarget = undefined; // Clear target
            return NodeStatus.RUNNING; // Planting takes time, so we run until the state machine changes it
          } else {
            human.activeAction = 'moving';
            human.target = plantTarget;
            human.direction = dirToTarget(human.position, plantTarget, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Move to Plant Spot and Plant',
        depth + 1,
      ),
    ],
    'Autopilot Plant',
    depth,
  );
}

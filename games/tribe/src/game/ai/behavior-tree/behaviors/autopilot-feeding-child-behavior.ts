import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY } from '../../../world-consts';
import { PlayerActionType } from '../../../ui/ui-types';

export function createAutopilotFeedingChildBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return human.isPlayer === true && activeAction?.action === PlayerActionType.AutopilotFeedChild;
        },
        'Has Autopilot Feed Child Command',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          if (activeAction?.action !== PlayerActionType.AutopilotFeedChild) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const targetId = activeAction.targetEntityId;
          const target = context.gameState.entities.entities.get(targetId) as HumanEntity | undefined;

          // Validate target
          if (!target || target.type !== 'human' || target.isAdult || human.food.length === 0) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
            // Clear the command. The HumanChildFeedingInteraction will handle the actual feeding.
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            human.activeAction = 'feeding';
            return NodeStatus.SUCCESS;
          } else {
            human.activeAction = 'moving';
            human.target = target.id;
            human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Execute Autopilot Feed Child',
        depth + 1,
      ),
    ],
    'Autopilot Feed Child',
    depth,
  );
}

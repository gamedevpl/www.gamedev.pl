import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY } from '../../../world-consts';
import { PlayerActionType } from '../../../ui/ui-types';

export function createAutopilotAttackingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return human.isPlayer === true && activeAction?.action === PlayerActionType.AutopilotAttack;
        },
        'Has Autopilot Attack Command',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          if (activeAction?.action !== PlayerActionType.AutopilotAttack) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const targetId = activeAction.targetEntityId;
          const target = context.gameState.entities.entities.get(targetId) as HumanEntity | undefined;

          // Target is invalid (dead or gone), clear the command.
          if (!target || target.type !== 'human' || target.hitpoints <= 0) {
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
            human.activeAction = 'attacking';
            human.attackTargetId = target.id;
            context.gameState.autopilotControls.activeAutopilotAction = undefined; // Clear command
            return NodeStatus.SUCCESS; // The attacking state will handle the rest
          } else {
            human.activeAction = 'moving';
            human.target = target.id;
            human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Execute Autopilot Attack',
        depth + 1,
      ),
    ],
    'Autopilot Attack',
    depth,
  );
}

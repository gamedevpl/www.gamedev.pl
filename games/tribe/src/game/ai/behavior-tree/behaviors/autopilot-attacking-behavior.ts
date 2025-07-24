import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY } from '../../../world-consts';

export function createAutopilotAttackingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotAttackTargetId;
          if (!targetId) {
            return false;
          }
          const target = context.gameState.entities.entities.get(targetId);
          if (!target || target.type !== 'human' || (target as HumanEntity).hitpoints <= 0) {
            // Target is invalid, clear it
            human.autopilotAttackTargetId = undefined;
            return false;
          }
          return true;
        },
        'Has Autopilot Attack Target',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotAttackTargetId;
          if (!targetId) {
            return NodeStatus.FAILURE;
          }
          const target = context.gameState.entities.entities.get(targetId) as HumanEntity;

          const distance = calculateWrappedDistance(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
            human.activeAction = 'attacking';
            human.attackTargetId = target.id;
            human.autopilotAttackTargetId = undefined; // Clear target once action is initiated
            return NodeStatus.SUCCESS;
          } else {
            human.activeAction = 'moving';
            human.target = target.id;
            human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Move to Autopilot Attack Target and Attack',
        depth + 1,
      ),
    ],
    'Autopilot Attack',
    depth,
  );
}

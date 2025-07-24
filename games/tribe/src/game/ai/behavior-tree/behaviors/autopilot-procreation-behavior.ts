import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import {
  AUTOPILOT_ACTION_PROXIMITY,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
} from '../../../world-consts';
import { PlayerActionType } from '../../../ui/ui-types';

export function createAutopilotProcreationBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;
          return (
            human.isPlayer === true &&
            context.gameState.autopilotControls.isActive &&
            activeAction?.action === PlayerActionType.AutopilotProcreate
          );
        },
        'Has Autopilot Procreate Command',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const activeAction = context.gameState.autopilotControls.activeAutopilotAction;

          if (activeAction?.action !== PlayerActionType.AutopilotProcreate) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined;
            return NodeStatus.FAILURE;
          }

          const targetId = activeAction.targetEntityId;
          const target = context.gameState.entities.entities.get(targetId) as HumanEntity | undefined;

          // Check if target is a valid partner
          if (
            !target ||
            target.type !== 'human' ||
            target.gender === human.gender ||
            !target.isAdult ||
            !human.isAdult ||
            (target.gender === 'female' && (target.isPregnant || target.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)) ||
            (human.gender === 'female' && (human.isPregnant || human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)) ||
            (target.procreationCooldown || 0) > 0 ||
            (human.procreationCooldown || 0) > 0 ||
            target.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
            human.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL
          ) {
            context.gameState.autopilotControls.activeAutopilotAction = undefined; // Target is invalid
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
            human.activeAction = 'procreating';
            context.gameState.autopilotControls.activeAutopilotAction = undefined; // Clear command
            return NodeStatus.SUCCESS;
          } else {
            human.activeAction = 'moving';
            human.target = target.id;
            human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
            return NodeStatus.RUNNING;
          }
        },
        'Execute Autopilot Procreate',
        depth + 1,
      ),
    ],
    'Autopilot Procreate',
    depth,
  );
}

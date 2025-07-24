import { HUMAN_INTERACTION_PROXIMITY } from '../../../world-consts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { ActionNode, ConditionNode, Selector, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { Blackboard } from '../behavior-tree-blackboard';

/**
 * Creates a behavior that moves the human to a player-commanded gather target (e.g., a berry bush)
 * and initiates gathering when in autopilot mode.
 *
 * The behavior is structured as a Sequence:
 * 1. Condition: Check if a valid autopilot gather target is set.
 * 2. Selector: Decide whether to move towards the target or to gather from it.
 *    - Move: If the human is too far from the target.
 *    - Gather: If the human is close enough to the target.
 */
export function createAutopilotGatheringBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is there a valid gather target and is autopilot active?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (
            !human.isPlayer ||
            !context.gameState.autopilotControls.isActive ||
            human.autopilotGatherTargetId === undefined
          ) {
            return false;
          }

          const targetBush = context.gameState.entities.entities.get(
            human.autopilotGatherTargetId,
          ) as BerryBushEntity | undefined;

          // If the target is gone or has no food, invalidate the command.
          if (!targetBush || targetBush.food.length === 0) {
            human.autopilotGatherTargetId = undefined;
            return false;
          }

          return true;
        },
        'Has Autopilot Gather Target',
        depth + 1,
      ),

      // 2. Selector: Choose between moving and gathering.
      new Selector(
        [
          // Branch A: Move to the bush if far away.
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  const targetBush = context.gameState.entities.entities.get(
                    human.autopilotGatherTargetId as number,
                  ) as BerryBushEntity; // Already validated in the parent node
                  const distance = calculateWrappedDistance(
                    human.position,
                    targetBush.position,
                    context.gameState.mapDimensions.width,
                    context.gameState.mapDimensions.height,
                  );
                  return distance > HUMAN_INTERACTION_PROXIMITY;
                },
                'Is Far From Bush',
                depth + 3,
              ),
              new ActionNode(
                (human: HumanEntity) => {
                  human.activeAction = 'moving';
                  human.target = human.autopilotGatherTargetId;
                  return NodeStatus.RUNNING;
                },
                'Set Move to Bush Action',
                depth + 3,
              ),
            ],
            'Move to Bush',
            depth + 2,
          ),

          // Branch B: Gather from the bush if close enough.
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  const targetBush = context.gameState.entities.entities.get(
                    human.autopilotGatherTargetId as number,
                  ) as BerryBushEntity;
                  const distance = calculateWrappedDistance(
                    human.position,
                    targetBush.position,
                    context.gameState.mapDimensions.width,
                    context.gameState.mapDimensions.height,
                  );
                  return distance <= HUMAN_INTERACTION_PROXIMITY;
                },
                'Is Close to Bush',
                depth + 3,
              ),
              new ActionNode(
                (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
                  const targetId = human.autopilotGatherTargetId;
                  // Clear the command to prevent re-triggering.
                  human.autopilotGatherTargetId = undefined;

                  const targetBush = context.gameState.entities.entities.get(targetId as number) as BerryBushEntity;
                  if (!targetBush || targetBush.food.length === 0) {
                    return [NodeStatus.FAILURE, 'Target invalid or depleted upon arrival'];
                  }

                  // Set the action; the interaction system will handle the rest.
                  human.activeAction = 'gathering';
                  human.target = targetId;

                  // Clear any cached food source from the regular gathering behavior
                  // to prevent conflicts.
                  blackboard.delete('foodSource');

                  return [NodeStatus.SUCCESS, `Arrived at bush ${targetId}`];
                },
                'Set Gather Action',
                depth + 3,
              ),
            ],
            'Gather from Bush',
            depth + 2,
          ),
        ],
        'Move or Gather',
        depth + 1,
      ),
    ],
    'Autopilot Gather From Target',
    depth,
  );
}

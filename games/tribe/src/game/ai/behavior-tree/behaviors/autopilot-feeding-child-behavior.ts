import { HumanEntity } from "../../../entities/characters/human/human-types";
import { UpdateContext } from "../../../world-types";
import { ActionNode, ConditionNode, Sequence } from "../nodes";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";
import { calculateWrappedDistance, dirToTarget } from "../../../utils/math-utils";
import { AUTOPILOT_ACTION_PROXIMITY } from "../../../world-consts";

export function createAutopilotFeedingChildBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotFeedChildTargetId;
          if (!targetId || human.food.length === 0) {
            if (targetId) human.autopilotFeedChildTargetId = undefined;
            return false;
          }
          const target = context.gameState.entities.entities.get(targetId);
          if (!target || target.type !== "human" || (target as HumanEntity).isAdult) {
            human.autopilotFeedChildTargetId = undefined;
            return false;
          }
          return true;
        },
        "Has Autopilot Feed Child Target",
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotFeedChildTargetId;
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
            human.autopilotFeedChildTargetId = undefined; // Clear target
            // Succeed here; the HumanChildFeedingInteraction will handle the rest
            return NodeStatus.SUCCESS;
          } else {
            human.activeAction = "moving";
            human.target = target.id;
            human.direction = dirToTarget(
              human.position,
              target.position,
              context.gameState.mapDimensions,
            );
            return NodeStatus.RUNNING;
          }
        },
        "Move to Child to Feed",
        depth + 1,
      ),
    ],
    "Autopilot Feed Child",
    depth,
  );
}

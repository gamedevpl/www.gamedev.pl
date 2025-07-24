import { HumanEntity } from "../../../entities/characters/human/human-types";
import { UpdateContext } from "../../../world-types";
import { ActionNode, ConditionNode, Sequence } from "../nodes";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";
import { calculateWrappedDistance, dirToTarget } from "../../../utils/math-utils";
import { AUTOPILOT_ACTION_PROXIMITY, HUMAN_FEMALE_MAX_PROCREATION_AGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from "../../../world-consts";

export function createAutopilotProcreationBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotProcreateTargetId;
          if (!targetId) {
            return false;
          }

          const target = context.gameState.entities.entities.get(targetId) as HumanEntity;

          // Check if target is a valid partner
          if (
            !target ||
            target.type !== "human" ||
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
            human.autopilotProcreateTargetId = undefined; // Target is invalid
            return false;
          }
          return true;
        },
        "Has Valid Autopilot Procreate Target",
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const targetId = human.autopilotProcreateTargetId;
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
            human.activeAction = "procreating";
            human.autopilotProcreateTargetId = undefined; // Clear target
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
        "Move to Partner and Procreate",
        depth + 1,
      ),
    ],
    "Autopilot Procreate",
    depth,
  );
}

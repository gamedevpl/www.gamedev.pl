import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from "../../../world-consts";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";
import { ActionNode, ConditionNode, Sequence } from "../nodes";

/**
 * Creates a behavior tree node for the "eating" behavior.
 * The human will eat if they are an adult, hungry enough, and have food.
 * @returns A behavior tree node representing the eating behavior.
 */
export function createEatingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition: Is the human hungry and has food?
      new ConditionNode(
        (human) => {
          return (
            (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) ??
            false
          );
        },
        'Is Hungry With Food',
        depth + 1,
      ),
      // Action: Set action to 'eating'
      new ActionNode((human) => {
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        human.activeAction = 'eating';
        return NodeStatus.SUCCESS;
      }, 'Set Action to Eating', depth + 1),
    ],
    'Eat',
    depth,
  );
}

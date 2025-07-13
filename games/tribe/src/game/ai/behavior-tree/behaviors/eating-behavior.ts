import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from "../../../world-consts";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";
import { ActionNode } from "../nodes";

/**
 * Creates a behavior tree node for the "eating" behavior.
 * The human will start and continue eating if they are hungry and have food.
 * This action returns RUNNING to persist the state across ticks, and FAILURE
 * if the conditions to eat are no longer met.
 * @returns A behavior tree node representing the eating behavior.
 */
export function createEatingBehavior(depth: number): BehaviorNode {
  return new ActionNode((human) => {
    const isHungry = human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
    const hasFood = human.food.length > 0;

    // The condition to continue or start eating.
    if (human.isAdult && isHungry && hasFood) {
      // Set action and state for eating.
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      human.activeAction = 'eating';
      // Return RUNNING to indicate the action is ongoing.
      // This prevents lower-priority behaviors from interrupting.
      return NodeStatus.RUNNING;
    }

    // If the conditions are not met, the action fails.
    // This allows the behavior tree to evaluate other branches.
    return NodeStatus.FAILURE;
  }, 'Eat', depth);
}

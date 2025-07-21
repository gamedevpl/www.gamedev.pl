import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';

/**
 * Creates a behavior tree node for the "eating" behavior.
 * The human will start and continue eating if they are hungry and have food.
 * This action returns RUNNING to persist the state across ticks, and FAILURE
 * if the conditions to eat are no longer met.
 * @returns A behavior tree node representing the eating behavior.
 */
export function createEatingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      new ConditionNode(
        (human, context) => {
          const isHungry = human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
          const hasFood = human.food.length > 0;
          const canEat = !human.eatingCooldownTime || context.gameState.time >= human.eatingCooldownTime;

          return [
            human.isAdult && isHungry && hasFood && canEat ? true : false,
            `${Math.floor(human.hunger - HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING)}, ${human.food.length}, ${
              human.eatingCooldownTime ? Math.floor(human.eatingCooldownTime - context.gameState.time) : ''
            }`,
          ];
        },
        'Can Eat',
        depth + 1,
      ),
      new ActionNode(
        (human) => {
          // Set action and state for eating.
          human.direction = { x: 0, y: 0 };
          human.target = undefined;
          human.activeAction = 'eating';
          // Return RUNNING to indicate the action is ongoing.
          // This prevents lower-priority behaviors from interrupting.
          return NodeStatus.RUNNING;
        },
        'Eat',
        depth + 1,
      ),
    ],
    'Eating',
    depth,
  );
}

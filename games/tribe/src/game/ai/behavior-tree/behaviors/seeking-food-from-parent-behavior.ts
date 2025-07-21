import { HumanEntity } from '../../../entities/characters/human/human-types';
import {
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
} from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { findClosestEntity, findParents } from '../../../utils/world-utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { calculateWrappedDistance } from '../../../utils/math-utils';

/**
 * Creates a behavior tree branch that makes a child seek food from a parent.
 * This behavior is a sequence of checking conditions, finding a target, and executing movement.
 *
 * @returns A behavior node representing the entire "seeking food from parent" logic.
 */
export function createSeekingFoodFromParentBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Am I a hungry child?
      new ConditionNode(
        (human: HumanEntity) => {
          return !human.isAdult && human.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;
        },
        'Is Hungry Child',
        depth + 1,
      ),

      // 2. Action: Find a suitable parent with food nearby.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const parents = findParents(human, context.gameState);
          if (parents.length === 0) {
            return NodeStatus.FAILURE;
          }

          const parentWithFood = findClosestEntity<HumanEntity>(
            human,
            context.gameState,
            'human',
            CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
            (p) => {
              // Check if the entity is a parent and has food
              return parents.some((pp) => pp.id === p.id) && p.food.length > 0;
            },
          );

          if (parentWithFood) {
            blackboard.set('targetParent', parentWithFood);
            return NodeStatus.SUCCESS;
          }

          return NodeStatus.FAILURE;
        },
        'Find Parent With Food',
        depth + 1,
      ),

      // 3. Action: Move towards the found parent.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const parent = blackboard.get<HumanEntity>('targetParent');
          if (!parent) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            parent.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          human.activeAction = 'idle';

          // If close enough to the parent, the behavior is successful.
          if (distance <= PARENT_FEEDING_RANGE) {
            human.target = undefined; // Stop moving
            return NodeStatus.SUCCESS;
          }

          // Otherwise, keep moving towards the parent.
          human.target = parent.id;
          human.activeAction = 'moving';
          return NodeStatus.RUNNING;
        },
        'Move To Parent',
        depth + 1,
      ),
    ],
    'Seek Food From Parent',
    depth,
  );
}

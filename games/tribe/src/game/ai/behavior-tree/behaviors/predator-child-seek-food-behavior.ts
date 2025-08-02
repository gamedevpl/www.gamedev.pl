import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import {
  ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  ANIMAL_PARENT_FEEDING_RANGE
} from '../../../animal-consts.ts';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { calculateWrappedDistance } from '../../../utils/math-utils';

/**
 * Creates a behavior tree branch that makes a predator child seek food from a female parent.
 * This behavior is a sequence of checking conditions, finding a target, and executing movement.
 *
 * @returns A behavior node representing the entire "seeking food from parent" logic for predators.
 */
export function createPredatorSeekingFoodFromParentBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // 1. Condition: Am I a hungry predator child?
      new ConditionNode(
        (predator: PredatorEntity) => {
          return !predator.isAdult && predator.hunger >= ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;
        },
        'Is Hungry Predator Child',
        depth + 1,
      ),

      // 2. Action: Find a suitable female parent nearby.
      new ActionNode(
        (predator: PredatorEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!predator.motherId) {
            return NodeStatus.FAILURE; // No mother to seek food from
          }

          const femaleParent = context.gameState.entities.entities.get(predator.motherId) as PredatorEntity | undefined;

          if (femaleParent) {
            blackboard.set('targetParent', femaleParent);
            return NodeStatus.SUCCESS;
          }

          return NodeStatus.FAILURE;
        },
        'Find Female Parent',
        depth + 1,
      ),

      // 3. Action: Move towards the found parent.
      new ActionNode(
        (predator: PredatorEntity, context: UpdateContext, blackboard: Blackboard) => {
          const parent = blackboard.get<PredatorEntity>('targetParent');
          if (!parent) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            predator.position,
            parent.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          predator.activeAction = 'idle';

          // If close enough to the parent, the behavior is successful.
          if (distance <= ANIMAL_PARENT_FEEDING_RANGE) {
            predator.target = undefined; // Stop moving
            return NodeStatus.SUCCESS;
          }

          // Otherwise, keep moving towards the parent.
          predator.target = parent.id;
          predator.activeAction = 'moving';
          return NodeStatus.RUNNING;
        },
        'Move To Female Parent',
        depth + 1,
      ),
    ],
    'Seek Food From Female Parent',
    depth,
  );
}

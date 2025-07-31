/* eslint-disable @typescript-eslint/no-explicit-any */
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import {
  ANIMAL_CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
  ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  ANIMAL_PARENT_FEEDING_RANGE,
} from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { findClosestEntity, findParents } from '../../../utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { calculateWrappedDistance } from '../../../utils/math-utils';

/**
 * Creates a behavior tree branch that makes a prey child seek food from a female parent.
 * This behavior is a sequence of checking conditions, finding a target, and executing movement.
 *
 * @returns A behavior node representing the entire "seeking food from parent" logic for prey.
 */
export function createPreySeekingFoodFromParentBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Am I a hungry prey child?
      new ConditionNode(
        (prey: any) => {
          return !prey.isAdult && prey.hunger >= ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;
        },
        'Is Hungry Prey Child',
        depth + 1,
      ),

      // 2. Action: Find a suitable female parent nearby.
      new ActionNode(
        (prey: any, context: UpdateContext, blackboard: Blackboard) => {
          const parents = findParents(prey as any, context.gameState);
          if (parents.length === 0) {
            return NodeStatus.FAILURE;
          }

          const femaleParent = findClosestEntity<PreyEntity>(
            prey,
            context.gameState,
            'prey',
            ANIMAL_CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
            (p) => {
              // Check if the entity is a female parent
              return !!(
                parents.some((pp: any) => pp.id === p.id) &&
                p.gender === 'female' &&
                p.isAdult &&
                p.hunger < 80 // Parent must not be too hungry herself
              );
            },
          );

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
        (prey: any, context: UpdateContext, blackboard: Blackboard) => {
          const parent = blackboard.get<PreyEntity>('targetParent');
          if (!parent) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            prey.position,
            parent.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          prey.activeAction = 'idle';

          // If close enough to the parent, the behavior is successful.
          if (distance <= ANIMAL_PARENT_FEEDING_RANGE) {
            prey.target = undefined; // Stop moving
            return NodeStatus.SUCCESS;
          }

          // Otherwise, keep moving towards the parent.
          prey.target = parent.id;
          prey.activeAction = 'moving';
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
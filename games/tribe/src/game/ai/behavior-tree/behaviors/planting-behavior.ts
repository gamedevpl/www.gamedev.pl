import { FoodType } from '../../../food/food-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findOptimalBushPlantingSpot } from '../../../utils/world-utils';
import {
  BERRY_COST_FOR_PLANTING,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';

/**
 * Creates a behavior tree branch for planting a new berry bush.
 *
 * The behavior is a sequence of actions:
 * 1. Check if the conditions for planting are met (has enough berries, not too hungry).
 * 2. Find a suitable, unoccupied spot to plant the bush.
 * 3. Move to the designated spot.
 * 4. Execute the planting action.
 */
export function createPlantingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Can I plant?
      new ConditionNode(
        (human) => {
          const hasEnoughBerries =
            human.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING;
          const isNotStarving = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING;
          return hasEnoughBerries && isNotStarving;
        },
        'Can Plant',
        depth + 1,
      ),

      // 2. Action: Find a spot to plant
      new ActionNode(
        (human, context, blackboard) => {
          const spot = findOptimalBushPlantingSpot(human, context.gameState);
          if (spot) {
            blackboard.set('plantingSpot', spot);
            return NodeStatus.SUCCESS;
          }
          return NodeStatus.FAILURE;
        },
        'Find Planting Spot',
        depth + 1,
      ),

      // 3. Action: Move to the spot
      new ActionNode(
        (human, context, blackboard) => {
          const plantingSpot = blackboard.get<Vector2D>('plantingSpot');
          if (!plantingSpot) {
            return NodeStatus.FAILURE; // Should have been set by the previous node
          }

          const distance = calculateWrappedDistance(
            human.position,
            plantingSpot,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance > HUMAN_INTERACTION_PROXIMITY) {
            human.activeAction = 'moving';
            human.targetPosition = plantingSpot;
            return NodeStatus.RUNNING; // Still moving towards the spot
          }

          // Arrived at the spot
          return NodeStatus.SUCCESS;
        },
        'Move To Planting Spot',
        depth + 1,
      ),

      // 4. Action: Set the planting action
      new ActionNode(
        (human, _context, blackboard) => {
          human.activeAction = 'planting';
          human.targetPosition = undefined; // Clear movement target
          blackboard.set('plantingSpot', undefined); // Clean up blackboard
          return NodeStatus.SUCCESS;
        },
        'Set Action to Planting',
        depth + 1,
      ),
    ],
    'Plant Bush',
    depth,
  );
}

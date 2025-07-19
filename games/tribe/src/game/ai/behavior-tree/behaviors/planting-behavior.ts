import { FoodType } from '../../../food/food-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { countEntitiesOfTypeInRadius, findChildren, findOptimalBushPlantingSpot } from '../../../utils/world-utils';
import {
  AI_PLANTING_CHECK_RADIUS,
  BERRY_COST_FOR_PLANTING,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';

/**
 * Creates a behavior tree branch for planting a new berry bush.
 *
 * This behavior is stateful. It finds an optimal spot, stores it in the blackboard,
 * moves the human to that spot, and then initiates the planting action. It will
 * return RUNNING until the action is completed or interrupted, preventing the AI
 * from changing its mind mid-process.
 */
export function createPlantingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Check if the AI is in a state to plant.
      new ConditionNode(
        (human) => {
          const hasEnoughBerries =
            human.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING;
          const isNotStarving = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING;
          // Ensure the human is an adult
          return (human.isAdult && hasEnoughBerries && isNotStarving) ?? false;
        },
        'Can Plant',
        depth + 1,
      ),

      // 3. Condition: Enough bushes around check,
      new ConditionNode(
        (human, context) => {
          const nearbyBushes = countEntitiesOfTypeInRadius(
            human.position,
            context.gameState,
            'berryBush',
            AI_PLANTING_CHECK_RADIUS,
          );
          const children = findChildren(context.gameState, human);
          // bush per child ratio should be at least 1:2
          const hasEnoughBerriesForChildren = children.length === 0 || nearbyBushes >= children.length * 2;
          return !hasEnoughBerriesForChildren; // Ensure there are bushes to plant
        },
        'Has Not Enough Nearby Bushes',
        depth + 1,
      ),

      // 3. Action: Find a spot, move to it, and plant. This is a stateful action.
      new ActionNode(
        (human, context, blackboard) => {
          const BLACKBOARD_KEY = 'plantingSpot';
          let plantingSpot = blackboard.get<Vector2D>(BLACKBOARD_KEY);

          // If the human is not moving towards the spot or planting, but a spot is still set,
          // it means the action was interrupted or completed. Clean up and fail to allow re-evaluation.
          if (
            plantingSpot &&
            human.activeAction !== 'planting' &&
            (human.activeAction !== 'moving' || human.target !== plantingSpot)
          ) {
            blackboard.set(BLACKBOARD_KEY, undefined);
            return NodeStatus.FAILURE;
          }

          // Find a spot if one isn't already selected
          if (!plantingSpot) {
            const spot = findOptimalBushPlantingSpot(human, context.gameState);
            if (spot) {
              blackboard.set(BLACKBOARD_KEY, spot);
              plantingSpot = spot;
            } else {
              return NodeStatus.FAILURE; // No suitable spot found
            }
          }

          // We have a spot, now check distance and act
          const distance = calculateWrappedDistance(
            human.position,
            plantingSpot,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Move to the spot if not close enough
          if (distance > HUMAN_INTERACTION_PROXIMITY) {
            human.activeAction = 'moving';
            human.target = plantingSpot;
            human.direction = dirToTarget(human.position, plantingSpot, context.gameState.mapDimensions);
            return NodeStatus.RUNNING; // Still moving towards the spot
          }

          // Arrived at the spot, start planting
          human.activeAction = 'planting';
          human.target = plantingSpot;
          // Once the state machine finishes, the activeAction will change,
          // causing the cleanup logic at the start of this node to run.
          return NodeStatus.RUNNING;
        },
        'Find, Move, and Plant',
        depth + 1,
      ),
    ],
    'Plant Bush',
    depth,
  );
}

import { FoodType } from '../../../food/food-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance, dirToTarget, getDirectionVectorOnTorus, vectorAdd } from '../../../utils/math-utils';
import {
  countEntitiesOfTypeInRadius,
  findChildren,
  findOptimalBushPlantingSpot,
  findOptimalPlantingZoneSpot,
  isPositionOccupied,
} from '../../../utils';
import {
  AI_PLANTING_CHECK_RADIUS,
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  BERRY_COST_FOR_PLANTING,
} from '../../../berry-bush-consts.ts';
import { BT_PLANTING_SEARCH_COOLDOWN_HOURS, HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING } from '../../../ai-consts.ts';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';

const BLACKBOARD_KEY = 'plantingSpot';

/**
 * Helper function to get the closest wrapped representation of a target position
 * relative to the source position on a toroidal world.
 * This ensures the entity moves along the shortest path.
 */
function getClosestWrappedTarget(
  sourcePosition: Vector2D,
  targetPosition: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  const direction = getDirectionVectorOnTorus(sourcePosition, targetPosition, worldWidth, worldHeight);
  return vectorAdd(sourcePosition, direction);
}

/**
 * Creates a behavior tree branch for planting a new berry bush.
 *
 * This behavior is stateful and optimized. It uses a selector to either continue
 * an existing planting task or to start a new one. The search for a new planting
 * spot is the most expensive part, so it's wrapped in a CooldownNode to prevent
 * it from running on every tick, which improves performance.
 */
export function createPlantingBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to move to the spot and plant. Assumes 'plantingSpot' is in the blackboard.
  const moveAndPlantAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const plantingSpot = Blackboard.get<Vector2D>(blackboard, BLACKBOARD_KEY);

      // Guard: If the spot is gone, fail and clear the blackboard.
      if (
        !plantingSpot ||
        isPositionOccupied(plantingSpot, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)
      ) {
        Blackboard.delete(blackboard, BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is missing'];
      }

      // Calculate the closest wrapped representation of the target
      const closestTarget = getClosestWrappedTarget(
        human.position,
        plantingSpot,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // Check distance to the target spot
      const distance = calculateWrappedDistance(
        human.position,
        closestTarget,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // If not close enough, keep moving.
      if (distance > HUMAN_INTERACTION_PROXIMITY) {
        human.activeAction = 'moving';
        human.target = closestTarget;
        human.direction = dirToTarget(human.position, closestTarget, context.gameState.mapDimensions);
        return [NodeStatus.RUNNING, 'Moving to planting spot: ' + distance.toFixed(2) + ' units away'];
      }

      // Arrived at the spot. Now check if it's still available.
      if (isPositionOccupied(plantingSpot, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
        Blackboard.delete(blackboard, BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is now occupied'];
      }

      // Spot is available, initiate the planting state.
      // The Human state machine will handle the actual planting.
      // This node will return RUNNING. When the state machine finishes planting,
      // it should change the human's activeAction. The next time this behavior runs,
      // the newly planted bush will cause isPositionOccupied to be true,
      // which will clear the blackboard key and cause this action to fail,
      // allowing a new spot to be found later.
      human.activeAction = 'planting';
      human.target = plantingSpot;
      return [NodeStatus.RUNNING, 'Planting state initiated'];
    },
    'Move To Spot and Plant',
    depth + 3,
  );

  // Action to find a new spot. This is the expensive operation.
  const findSpotAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      // First, try to find a spot in a planting zone
      let spot = findOptimalPlantingZoneSpot(human, context.gameState);

      // If no zones exist or all are full, fall back to the original behavior
      if (!spot) {
        spot = findOptimalBushPlantingSpot(human, context.gameState);
      }

      if (spot) {
        Blackboard.set(blackboard, BLACKBOARD_KEY, spot);
        return [NodeStatus.SUCCESS, `Found new spot at ${spot.x.toFixed(0)}, ${spot.y.toFixed(0)}`];
      }
      return [NodeStatus.FAILURE, 'No suitable planting spot found'];
    },
    'Find Optimal Planting Spot',
    depth + 3,
  );

  return new Sequence(
    [
      // 1. Basic conditions: Check if the AI is in a state to plant.
      new ConditionNode(
        (human) => {
          const hasEnoughBerries =
            human.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING;
          const isNotStarving = human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING;
          return (human.isAdult && hasEnoughBerries && isNotStarving) ?? false;
        },
        'Can Plant',
        depth + 1,
      ),

      // 2. Environmental condition: Check if there's a need for more bushes.
      new ConditionNode(
        (human, context) => {
          const nearbyBushes = countEntitiesOfTypeInRadius(
            human.position,
            context.gameState,
            'berryBush',
            AI_PLANTING_CHECK_RADIUS,
          );
          const children = findChildren(context.gameState, human);
          // Plant more if the bush-to-child ratio is less than 2:1
          const hasEnoughBushesForChildren = children.length === 0 || nearbyBushes >= children.length * 5;
          return !hasEnoughBushesForChildren;
        },
        'Has Not Enough Nearby Bushes',
        depth + 1,
      ),

      // 3. Main logic: Either continue the current planting task or find a new spot.
      new Selector(
        [
          // Branch A: A spot is already chosen. Move to it and plant.
          new Sequence(
            [
              new ConditionNode(
                (_, __, blackboard) => Blackboard.has(blackboard, BLACKBOARD_KEY),
                'Has Planting Spot?',
                depth + 2,
              ),
              moveAndPlantAction,
            ],
            'Continue Planting Action',
            depth + 2,
          ),
          // Branch B: No spot chosen. Find one (with cooldown).
          new CooldownNode(BT_PLANTING_SEARCH_COOLDOWN_HOURS, findSpotAction, 'Find Planting Spot Cooldown', depth + 2),
        ],
        'Perform or Start Planting',
        depth + 1,
      ),
    ],
    'Plant Bush',
    depth,
  );
}

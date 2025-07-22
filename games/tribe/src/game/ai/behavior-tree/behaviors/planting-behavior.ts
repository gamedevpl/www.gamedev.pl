import { FoodType } from '../../../food/food-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import {
  countEntitiesOfTypeInRadius,
  findChildren,
  findOptimalBushPlantingSpot,
  isPositionOccupied,
} from '../../../utils/world-utils';
import {
  AI_PLANTING_CHECK_RADIUS,
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  BERRY_COST_FOR_PLANTING,
  BT_PLANTING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';

const BLACKBOARD_KEY = 'plantingSpot';

/**
 * Creates a behavior tree branch for planting a new berry bush.
 *
 * This behavior is stateful and optimized. It uses a selector to either continue
 * an existing planting task or to start a new one. The search for a new planting
 * spot is the most expensive part, so it's wrapped in a CooldownNode to prevent
 * it from running on every tick, which improves performance.
 */
export function createPlantingBehavior(depth: number): BehaviorNode {
  // Action to move to the spot and plant. Assumes 'plantingSpot' is in the blackboard.
  const moveAndPlantAction = new ActionNode(
    (human, context, blackboard) => {
      const plantingSpot = blackboard.get<Vector2D>(BLACKBOARD_KEY);

      // Guard & Cleanup: If the spot is gone or now occupied (by something other than the human itself),
      // fail and clear the blackboard. The human itself should not block its own planting spot.
      if (
        !plantingSpot ||
        isPositionOccupied(plantingSpot, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)
      ) {
        blackboard.delete(BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is invalid or now occupied'];
      }

      // Check distance to the target spot
      const distance = calculateWrappedDistance(
        human.position,
        plantingSpot,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // If not close enough, keep moving.
      if (distance > HUMAN_INTERACTION_PROXIMITY) {
        human.activeAction = 'moving';
        human.target = plantingSpot;
        human.direction = dirToTarget(human.position, plantingSpot, context.gameState.mapDimensions);
        return [NodeStatus.RUNNING, 'Moving to planting spot'];
      }

      // Arrived at the spot, initiate the planting state.
      // The Human state machine will handle the actual planting.
      // This node will return RUNNING. When the state machine finishes planting,
      // it should change the human's activeAction. The next time this behavior runs,
      // isPositionOccupied will be true (because of the new bush), which will clear
      // the blackboard key and cause this action to fail, allowing a new spot to be found later.
      human.activeAction = 'planting';
      human.target = plantingSpot;
      return [NodeStatus.RUNNING, 'Planting state initiated'];
    },
    'Move To Spot and Plant',
    depth + 3,
  );

  // Action to find a new spot. This is the expensive operation.
  const findSpotAction = new ActionNode(
    (human, context, blackboard) => {
      const spot = findOptimalBushPlantingSpot(human, context.gameState);
      if (spot) {
        blackboard.set(BLACKBOARD_KEY, spot);
        return [NodeStatus.SUCCESS, `Found new spot at ${spot.x.toFixed(0)}, ${spot.y.toFixed(0)}`];
      }
      return [NodeStatus.FAILURE, 'No suitable planting spot found'];
    },
    'Find Optimal Planting Spot',
    depth + 3,
  );

  return new Sequence(
    [
      new ConditionNode((human, context) => {
        return !human.isPlayer || context.gameState.autopilotControls.behaviors.planting;
      }),

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
          const hasEnoughBushesForChildren = children.length === 0 || nearbyBushes >= children.length * 2;
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
              new ConditionNode((_, __, blackboard) => blackboard.has(BLACKBOARD_KEY), 'Has Planting Spot?', depth + 2),
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

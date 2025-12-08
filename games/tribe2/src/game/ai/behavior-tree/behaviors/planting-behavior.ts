import { FoodType } from '../../../food/food-types';
import { Vector2D } from '../../../utils/math-types';
import { calculateWrappedDistance, dirToTarget, getDirectionVectorOnTorus, vectorAdd } from '../../../utils/math-utils';
import { findOptimalPlantingZoneSpot, isPositionOccupied, getTribeMembers } from '../../../utils';
import {
  calculateTribeFoodSecurity,
  getProductiveBushDensity,
  countTribeMembersWithAction,
} from '../../../utils/tribe-food-utils';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, BERRY_COST_FOR_PLANTING } from '../../../berry-bush-consts.ts';
import {
  BT_PLANTING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING,
  FOOD_SECURITY_EMERGENCY_THRESHOLD,
  FOOD_SECURITY_GROWTH_THRESHOLD,
  FOOD_SECURITY_MAINTENANCE_THRESHOLD,
  BUSHES_PER_MEMBER_EMERGENCY,
  BUSHES_PER_MEMBER_GROWTH,
  BUSHES_PER_MEMBER_MAINTENANCE,
  BUSHES_PER_MEMBER_ABUNDANCE,
} from '../../../ai-consts.ts';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';

const BLACKBOARD_KEY = 'plantingSpot';
const PLANTING_PROXIMITY_RADIUS = 50;

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
 *
 * Enhanced with adaptive logic based on tribe food security and smart zone distribution.
 * Now includes tribal task coordination via TribalTaskDecorator.
 */
export function createPlantingBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to move to the spot and plant. Assumes 'plantingSpot' is in the blackboard.
  const moveAndPlantAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const plantingSpot = Blackboard.get<Vector2D>(blackboard, BLACKBOARD_KEY);

      // Guard: If the spot is gone, fail and clear the blackboard.
      if (!plantingSpot) {
        Blackboard.delete(blackboard, BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is missing'];
      }

      // Check if spot is occupied
      if (isPositionOccupied(plantingSpot, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
        Blackboard.delete(blackboard, BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is occupied'];
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

      // Arrived at the spot. Check one more time if it's still available.
      if (isPositionOccupied(plantingSpot, context.gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
        Blackboard.delete(blackboard, BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Planting spot is now occupied'];
      }

      // Spot is available, initiate the planting state.
      // The Human state machine will handle the actual planting.
      human.activeAction = 'planting';
      human.target = plantingSpot;
      return [NodeStatus.RUNNING, 'Planting state initiated'];
    },
    'Move To Spot and Plant',
    depth + 4,
  );

  // Wrap the move and plant action with the tribal task decorator
  const coordinatedMoveAndPlant = new TribalTaskDecorator(
    moveAndPlantAction,
    {
      taskType: 'plant',
      proximityRadius: PLANTING_PROXIMITY_RADIUS,
      getTargetPosition: (_entity, _context, blackboard) =>
        Blackboard.get<Vector2D>(blackboard, BLACKBOARD_KEY) ?? null,
    },
    'Coordinated Planting',
    depth + 3,
  );

  // Action to find a new spot. This is the expensive operation.
  const findSpotAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      let spot = findOptimalPlantingZoneSpot(human, context.gameState);

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
          const canPlant = (human.isAdult && hasEnoughBerries && isNotStarving) ?? false;
          return [
            canPlant,
            canPlant
              ? 'Can plant'
              : `Cannot plant: adult=${human.isAdult}, berries=${
                  human.food.filter((f) => f.type === FoodType.Berry).length
                }/${BERRY_COST_FOR_PLANTING}, hunger=${human.hunger.toFixed(0)}`,
          ];
        },
        'Can Plant',
        depth + 1,
      ),

      // 2. Environmental condition: Check if there's a need for more bushes (adaptive).
      new ConditionNode(
        (human, context) => {
          if (!human.leaderId) {
            return [false, 'No tribe'];
          }

          const foodSecurity = calculateTribeFoodSecurity(human, context.gameState);
          const bushDensity = getProductiveBushDensity(human.leaderId, context.gameState);

          // Determine required bushes per member based on food security
          let requiredBushesPerMember: number;
          if (foodSecurity < FOOD_SECURITY_EMERGENCY_THRESHOLD) {
            // Emergency: focus on gathering, minimal planting
            requiredBushesPerMember = BUSHES_PER_MEMBER_EMERGENCY;
          } else if (foodSecurity < FOOD_SECURITY_GROWTH_THRESHOLD) {
            requiredBushesPerMember = BUSHES_PER_MEMBER_GROWTH;
          } else if (foodSecurity < FOOD_SECURITY_MAINTENANCE_THRESHOLD) {
            requiredBushesPerMember = BUSHES_PER_MEMBER_MAINTENANCE;
          } else {
            // Abundance: conservative planting
            requiredBushesPerMember = BUSHES_PER_MEMBER_ABUNDANCE;
          }

          const needsMoreBushes = bushDensity < requiredBushesPerMember;

          return [
            needsMoreBushes,
            `Food security: ${(foodSecurity * 100).toFixed(0)}%, Bush density: ${bushDensity.toFixed(
              1,
            )}/${requiredBushesPerMember}`,
          ];
        },
        'Needs More Bushes (Adaptive)',
        depth + 1,
      ),

      // 3. Coordination check: Ensure not too many tribe members are planting simultaneously.
      new ConditionNode(
        (human, context) => {
          if (!human.leaderId) return [true, 'No tribe coordination needed'];

          const tribeMembers = getTribeMembers(human, context.gameState);
          const activePlanters = countTribeMembersWithAction(human.leaderId, context.gameState, 'planting');
          const maxPlanters = Math.max(1, Math.ceil(tribeMembers.length * 0.3)); // Max 30% of tribe

          return [activePlanters < maxPlanters, `Active planters: ${activePlanters}/${maxPlanters}`];
        },
        'Not Too Many Planters',
        depth + 1,
      ),

      // 4. Main logic: Either continue the current planting task or find a new spot.
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
              coordinatedMoveAndPlant,
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

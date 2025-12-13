import {
  BT_GATHERING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  AI_GATHERING_AVOID_OWNER_PROXIMITY,
  AI_GATHERING_SEARCH_RADIUS,
} from '../../../ai-consts';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';
import { ActionNode, ConditionNode, CachingNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findChildren, findClosestEntityWithDistance, ClosestEntityResult } from '../../../utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../../../entities/characters/corpse-types';
import { calculateWrappedDistanceSq, dirToTarget } from '../../../utils/math-utils';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { EntityId } from '../../../entities/entities-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { hasNearbyNonFullStorage } from '../../../utils/storage-utils';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../entities/tribe/tribe-task-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { isWithinOperatingRange } from '../../../entities/tribe/territory-utils';
import { BuildingEntity } from '../../../entities/buildings/building-types';

type FoodSource = BerryBushEntity | CorpseEntity;
const BLACKBOARD_KEY = 'foodSource';

// Distance threshold for considering a bush "good enough" to skip corpse search
const GOOD_ENOUGH_DISTANCE = 100;

/**
 * Creates a behavior tree for gathering food (from bushes or corpses).
 *
 * This behavior is stateful and optimized. It uses a selector to either continue
 * moving towards an existing target or to find a new one. The search for a new
 * food source is computationally more expensive, so it's wrapped in a CachingNode
 * to prevent it from running on every single AI tick, improving performance.
 *
 * Now includes tribe coordination via TribalTaskDecorator to prevent multiple members
 * from gathering from the same bush simultaneously.
 *
 * Performance optimizations:
 * - Uses byRadiusFirst for building ownership check (O(1) vs O(n) array creation)
 * - Uses squared distance comparisons to avoid sqrt overhead
 * - Returns distance from findClosestEntityWithDistance to avoid recomputing
 * - Short-circuits corpse search if a "good enough" bush is found nearby
 * - Caches owner distance lookups
 */
export function createGatheringBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to find the closest food source and store it in the blackboard.
  const findFoodSourceAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const leader = getTribeLeaderForCoordination(human, context.gameState);
      const indexedState = context.gameState as IndexedWorldState;
      const currentTime = context.gameState.time;
      const humanLeaderId = human.leaderId;

      // Cache for owner distance lookups to avoid recalculating for same owner
      const distanceToOwnerCache = new Map<EntityId, number>();

      // Helper to check if a food source is being gathered by another tribe member
      const isBeingGatheredByOther = (foodSourceId: EntityId): boolean => {
        if (!leader?.aiBlackboard) return false;
        const taskKey = `tribal_gather_${foodSourceId}`;
        const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
        if (!task) return false;
        // Check if task is not stale and assigned to someone else
        if (currentTime - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS) {
          return !task.memberIds.includes(human.id);
        }
        return false;
      };

      // Helper to check bush ownership without creating arrays
      const getBushOwner = (bush: BerryBushEntity): HumanEntity | undefined => {
        // Use byRadiusFirst to get first building overlapping the bush (O(1) vs building array)
        const building = indexedState.search.building.byRadiusFirst(bush.position, bush.radius) as
          | BuildingEntity
          | undefined;
        if (!building) return undefined;
        return context.gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
      };

      // Find closest bush with optimized predicate
      const bushResult = findClosestEntityWithDistance<BerryBushEntity>(
        human,
        context.gameState,
        'berryBush',
        AI_GATHERING_SEARCH_RADIUS,
        (bush) => {
          // Quick checks first (no lookups)
          if (bush.food.length === 0) return false;

          // Territory check
          if (humanLeaderId && !isWithinOperatingRange(bush.position, humanLeaderId, context.gameState)) {
            return false;
          }

          // Tribal task check
          if (isBeingGatheredByOther(bush.id)) return false;

          // Ownership check - optimized with byRadiusFirst
          const owner = getBushOwner(bush);
          if (!owner) return true; // No owner, fair game

          // Same tribe check
          if (owner.leaderId === humanLeaderId) return true;

          // Different tribe - check proximity (cached)
          let distanceToOwner = distanceToOwnerCache.get(owner.id);
          if (distanceToOwner === undefined) {
            const distSq = calculateWrappedDistanceSq(
              human.position,
              owner.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            distanceToOwner = Math.sqrt(distSq);
            distanceToOwnerCache.set(owner.id, distanceToOwner);
          }

          return distanceToOwner > AI_GATHERING_AVOID_OWNER_PROXIMITY;
        },
      );

      // Short-circuit: skip corpse search if we found a bush that's close enough
      let corpseResult: ClosestEntityResult<CorpseEntity> | null = null;
      if (!bushResult || bushResult.distance > GOOD_ENOUGH_DISTANCE) {
        // Find closest corpse
        corpseResult = findClosestEntityWithDistance<CorpseEntity>(
          human,
          context.gameState,
          'corpse',
          AI_GATHERING_SEARCH_RADIUS,
          (c) => {
            if (c.food.length === 0) return false;

            // Territory check
            if (humanLeaderId && !isWithinOperatingRange(c.position, humanLeaderId, context.gameState)) {
              return false;
            }

            // Tribal task check
            return !isBeingGatheredByOther(c.id);
          },
        );
      }

      // Choose the closer food source using pre-computed distances
      let foodSource: FoodSource | null = null;
      if (bushResult && corpseResult) {
        foodSource = bushResult.distance <= corpseResult.distance ? bushResult.entity : corpseResult.entity;
      } else if (bushResult) {
        foodSource = bushResult.entity;
      } else if (corpseResult) {
        foodSource = corpseResult.entity;
      }

      if (foodSource) {
        Blackboard.set(blackboard, BLACKBOARD_KEY, foodSource.id);
        return [
          NodeStatus.SUCCESS,
          `Found food: ${foodSource.type} at ${foodSource.position.x.toFixed(0)},${foodSource.position.y.toFixed(0)}`,
        ];
      }
      return [NodeStatus.FAILURE, 'No food source found'];
    },
    'Find Closest Food Source',
    depth + 4,
  );

  // Action to move towards the food source and gather from it.
  const moveAndGatherAction = new TribalTaskDecorator(
    new ActionNode<HumanEntity>(
      (human, context, blackboard) => {
        const targetId = Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY);
        if (!targetId) {
          return [NodeStatus.FAILURE, 'No target in blackboard'];
        }
        const target = context.gameState.entities.entities[targetId] as FoodSource | undefined;

        // Guard: If no target, fail.
        if (!target || target.food.length === 0) {
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.FAILURE, 'Food source is invalid or depleted'];
        }

        // Use squared distance to avoid sqrt overhead
        const distanceSq = calculateWrappedDistanceSq(
          human.position,
          target.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        const proximityThresholdSq = HUMAN_INTERACTION_PROXIMITY * HUMAN_INTERACTION_PROXIMITY;

        // If close enough, start gathering. The state machine will handle the rest.
        if (distanceSq < proximityThresholdSq) {
          human.activeAction = 'gathering';
          human.direction = { x: 0, y: 0 };
          human.target = target.id; // Set target for interaction system

          // Clear blackboard target only after successfully starting to gather
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.SUCCESS, `Gathering from ${target.type}`];
        } else {
          // Not close enough, so move towards the target.
          human.activeAction = 'moving';
          human.target = target.id;
          human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
          // Keep target in blackboard while moving (RUNNING state)
          return [NodeStatus.RUNNING, `Moving to ${target.type}`];
        }
      },
      'Move To Food and Gather',
      depth + 3,
    ),
    {
      taskType: 'gather',
      maxCapacity: 2,
      getTargetId: (_entity, _context, blackboard) => Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY) ?? null,
    },
    'Tribal Gather Task',
    depth + 3,
  );

  return new Sequence(
    [
      // 1. Initial condition checks.
      new ConditionNode(
        (human, context) => {
          const hasCapacity = human.food.length < human.maxFood;
          const isHungryEnough = human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING;
          const hungryChildren = findChildren(context.gameState, human).filter(
            (child) => child.hunger > CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
          );

          // Check for nearby non-full storage spots
          const hasNonFullStorage = hasNearbyNonFullStorage(human, context.gameState);

          return [
            (human.isAdult &&
              hasCapacity &&
              (isHungryEnough ||
                hungryChildren.length > 0 ||
                (hasNonFullStorage && isTribeRole(human, TribeRole.Gatherer, context.gameState)))) ??
              false,
            `${isHungryEnough ? 'Hungry' : ''}${
              hungryChildren.length > 0 ? ' Children(' + hungryChildren.length + ')' : ''
            }${hasNonFullStorage ? ' Storage' : ''}`,
          ];
        },
        'Should Gather Food',
        depth + 1,
      ),
      // 2. Main logic: either continue gathering or find a new source.
      new Selector(
        [
          // Branch A: Continue with an existing target.
          new Sequence(
            [
              new ConditionNode(
                (_, __, blackboard) => Blackboard.has(blackboard, BLACKBOARD_KEY),
                'Has Food Source?',
                depth + 2,
              ),
              moveAndGatherAction,
            ],
            'Continue Gathering Action',
            depth + 2,
          ),
          // Branch B: Find a new food source (with a cache).
          new Sequence(
            [
              new CachingNode(
                findFoodSourceAction,
                BT_GATHERING_SEARCH_COOLDOWN_HOURS,
                'Cache Food Source Search',
                depth + 3,
              ),
              moveAndGatherAction, // Once found, move and gather.
            ],
            'Find New Food Source and Gather',
            depth + 2,
          ),
        ],
        'Perform or Start Gathering',
        depth + 1,
      ),
    ],
    'Gather Food',
    depth,
  );
}

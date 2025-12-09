import {
  BT_GATHERING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  AI_GATHERING_AVOID_OWNER_PROXIMITY,
  AI_GATHERING_SEARCH_RADIUS,
} from '../../../ai-consts';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';
import { ActionNode, ConditionNode, CachingNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findChildren, findClosestEntity } from '../../../utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../../../entities/characters/corpse-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { EntityId } from '../../../entities/entities-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { hasNearbyNonFullStorage } from '../../../utils/storage-utils';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../utils/tribe-task-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';

type FoodSource = BerryBushEntity | CorpseEntity;
const BLACKBOARD_KEY = 'foodSource';

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
 */
export function createGatheringBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to find the closest food source and store it in the blackboard.
  const findFoodSourceAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const leader = getTribeLeaderForCoordination(human, context.gameState);
      const distanceToOwnerCache = new Map<EntityId, number>();

      const closestBush = findClosestEntity<BerryBushEntity>(
        human,
        context.gameState,
        'berryBush',
        AI_GATHERING_SEARCH_RADIUS,
        (bush) => {
          if (bush.food.length === 0) {
            return false;
          }

          // Check if another tribe member is already gathering from this bush
          if (leader && leader.aiBlackboard) {
            const taskKey = `tribal_gather_${bush.id}`;
            const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
            if (task) {
              // Check if task is not stale
              if (context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS) {
                // If assigned to someone else, skip it
                if (!task.memberIds.includes(human.id)) {
                  return false;
                }
              }
            }
          }

          // Bush is claimed. Get the owner.
          const ownerId = (context.gameState as IndexedWorldState).search.building.byRadius(
            bush.position,
            bush.radius,
          )[0]?.ownerId;
          const owner = context.gameState.entities.entities[ownerId!] as HumanEntity | undefined;
          if (!owner) {
            return true; // Owner doesn't exist, so it's fair game.
          }

          // If owner is from the same tribe (or is the human itself), it's okay to gather.
          if (owner.leaderId === human.leaderId) {
            return true;
          }

          // Owner is from a different tribe. Check proximity.
          const distanceToOwner =
            distanceToOwnerCache.get(owner.id) ??
            calculateWrappedDistance(
              human.position,
              owner.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
          distanceToOwnerCache.set(owner.id, distanceToOwner);

          // It's a valid target only if the owner is far away.
          return distanceToOwner > AI_GATHERING_AVOID_OWNER_PROXIMITY;
        },
      );

      const closestCorpse = findClosestEntity<CorpseEntity>(
        human,
        context.gameState,
        'corpse',
        AI_GATHERING_SEARCH_RADIUS,
        (c) => {
          if (c.food.length === 0) {
            return false;
          }
          // Check if another tribe member is already gathering from this corpse
          if (leader && leader.aiBlackboard) {
            const taskKey = `tribal_gather_${c.id}`;
            const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
            if (task) {
              if (context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS) {
                if (!task.memberIds.includes(human.id)) {
                  return false;
                }
              }
            }
          }
          return true;
        },
      );

      let foodSource: FoodSource | null = null;
      if (closestBush && closestCorpse) {
        const distToBush = calculateWrappedDistance(
          human.position,
          closestBush.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        const distToCorpse = calculateWrappedDistance(
          human.position,
          closestCorpse.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        foodSource = distToBush <= distToCorpse ? closestBush : closestCorpse;
      } else {
        foodSource = closestBush || closestCorpse;
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

        const distance = calculateWrappedDistance(
          human.position,
          target.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        // If close enough, start gathering. The state machine will handle the rest.
        if (distance < HUMAN_INTERACTION_PROXIMITY) {
          human.activeAction = 'gathering';
          human.direction = { x: 0, y: 0 };
          human.target = target.id; // Set target for interaction system

          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.SUCCESS, `Gathering from ${target.type}`];
        } else {
          // Not close enough, so move towards the target.
          human.activeAction = 'moving';
          human.target = target.id;
          human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
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
            (human.isAdult && hasCapacity && (isHungryEnough || hungryChildren.length > 0 || hasNonFullStorage)) ??
              false,
            `${isHungryEnough ? 'H' : ''}${hungryChildren.length > 0 ? ' HC(' + hungryChildren.length + ')' : ''}${
              hasNonFullStorage ? ' S' : ''
            }`,
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

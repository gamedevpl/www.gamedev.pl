import {
  BT_GATHERING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  AI_GATHERING_SEARCH_RADIUS,
} from '../../../ai-consts';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';
import { ActionNode, ConditionNode, CachingNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findChildren, findClosestEntity } from '../../../utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../../../entities/characters/corpse-types';
import { TreeEntity } from '../../../entities/plants/tree/tree-types';
import { TREE_FALLEN } from '../../../entities/plants/tree/states/tree-state-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { EntityId } from '../../../entities/entities-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { hasNearbyNonFullStorage } from '../../../utils/storage-utils';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../entities/tribe/tribe-task-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { isWithinOperatingRange } from '../../../entities/tribe/territory-utils';
import { getTribeWoodNeed } from '../../../entities/tribe/tribe-food-utils';

type ResourceSource = BerryBushEntity | CorpseEntity | TreeEntity;
const BLACKBOARD_KEY = 'resourceSource';

/**
 * Creates a behavior tree for gathering resources (food from bushes/corpses, or wood from fallen trees).
 *
 * This behavior is stateful and optimized. It uses a selector to either continue
 * moving towards an existing target or to find a new one. The search for a new
 * resource source is computationally more expensive, so it's wrapped in a CachingNode
 * to prevent it from running on every single AI tick, improving performance.
 *
 * Now includes wood gathering from fallen trees and tribe coordination.
 */
export function createGatheringBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to find the closest resource source and store it in the blackboard.
  const findResourceAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const leader = getTribeLeaderForCoordination(human, context.gameState);
      const woodNeed = leader ? getTribeWoodNeed(leader.id, context.gameState) : 0;

      const isHungryEnough = human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING;
      const hungryChildren = findChildren(context.gameState, human).filter(
        (child) => child.hunger > CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
      );
      const needsFood = isHungryEnough || hungryChildren.length > 0;
      const isGatherer = isTribeRole(human, TribeRole.Gatherer, context.gameState);

      // Search for food sources (bushes or corpses)
      const findFood = () => {
        const closestBush = findClosestEntity<BerryBushEntity>(
          human,
          context.gameState,
          'berryBush',
          AI_GATHERING_SEARCH_RADIUS,
          (bush) => {
            if (bush.food.length === 0) return false;
            if (human.leaderId && !isWithinOperatingRange(bush.position, human.leaderId, context.gameState))
              return false;
            if (leader && leader.aiBlackboard) {
              const taskKey = `tribal_gather_${bush.id}`;
              const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
              if (
                task &&
                context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS &&
                !task.memberIds.includes(human.id)
              )
                return false;
            }
            return true;
          },
        );

        const closestCorpse = findClosestEntity<CorpseEntity>(
          human,
          context.gameState,
          'corpse',
          AI_GATHERING_SEARCH_RADIUS,
          (c) => {
            if (c.food.length === 0) return false;
            if (human.leaderId && !isWithinOperatingRange(c.position, human.leaderId, context.gameState)) return false;
            if (leader && leader.aiBlackboard) {
              const taskKey = `tribal_gather_${c.id}`;
              const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
              if (
                task &&
                context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS &&
                !task.memberIds.includes(human.id)
              )
                return false;
            }
            return true;
          },
        );

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
          return distToBush <= distToCorpse ? closestBush : closestCorpse;
        }
        return closestBush || closestCorpse;
      };

      // Search for wood sources (fallen trees)
      const findWood = () => {
        return findClosestEntity<TreeEntity>(human, context.gameState, 'tree', AI_GATHERING_SEARCH_RADIUS, (tree) => {
          if (tree.stateMachine?.[0] !== TREE_FALLEN || tree.wood.length === 0) return false;
          if (human.leaderId && !isWithinOperatingRange(tree.position, human.leaderId, context.gameState)) return false;
          if (leader && leader.aiBlackboard) {
            const taskKey = `tribal_gather_${tree.id}`;
            const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
            if (
              task &&
              context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS &&
              !task.memberIds.includes(human.id)
            )
              return false;
          }
          return true;
        });
      };

      let resource: ResourceSource | null = null;

      // Prioritization logic
      if (needsFood && human.food.length < human.maxFood) {
        resource = findFood();
      } else if (woodNeed > 0 && !human.heldItem) {
        resource = findWood();
      } else if (isGatherer) {
        // Gatherers look for wood first if not hungry, then food for storage
        if (!human.heldItem) {
          resource = findWood();
        }
        if (!resource && human.food.length < human.maxFood) {
          resource = findFood();
        }
      }

      if (resource) {
        Blackboard.set(blackboard, BLACKBOARD_KEY, resource.id);
        return [
          NodeStatus.SUCCESS,
          `Found ${resource.type}: ${resource.id} at ${resource.position.x.toFixed(0)},${resource.position.y.toFixed(
            0,
          )}`,
        ];
      }
      return [NodeStatus.FAILURE, 'No resource found'];
    },
    'Find Closest Resource Source',
    depth + 4,
  );

  // Action to move towards the resource source and gather from it.
  const moveAndGatherAction = new TribalTaskDecorator(
    new ActionNode<HumanEntity>(
      (human, context, blackboard) => {
        const targetId = Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY);
        if (!targetId) {
          return [NodeStatus.FAILURE, 'No target in blackboard'];
        }
        const target = context.gameState.entities.entities[targetId] as ResourceSource | undefined;

        // Guard: If no target, fail.
        if (!target) {
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.FAILURE, 'Resource source is invalid'];
        }

        const isDepleted =
          target.type === 'tree' && 'wood' in target
            ? target.wood.length === 0
            : (target as BerryBushEntity | CorpseEntity).food.length === 0;
        if (isDepleted) {
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.FAILURE, 'Resource source is depleted'];
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
      'Move To Resource and Gather',
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
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          const woodNeed = leader ? getTribeWoodNeed(leader.id, context.gameState) : 0;

          const hasFoodCapacity = human.food.length < human.maxFood;
          const hasWoodCapacity = !human.heldItem;
          const isHungryEnough = human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING;
          const hungryChildren = findChildren(context.gameState, human).filter(
            (child) => child.hunger > CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
          );

          const isGatherer = isTribeRole(human, TribeRole.Gatherer, context.gameState);
          const hasNonFullStorage = hasNearbyNonFullStorage(human, context.gameState);

          const canGatherFood =
            hasFoodCapacity && (isHungryEnough || hungryChildren.length > 0 || (isGatherer && hasNonFullStorage));
          const canGatherWood = hasWoodCapacity && (woodNeed > 0 || (isGatherer && hasNonFullStorage));

          return [
            (human.isAdult && (canGatherFood || canGatherWood)) ?? false,
            `${isHungryEnough ? 'Hungry ' : ''}${
              hungryChildren.length > 0 ? 'Children(' + hungryChildren.length + ') ' : ''
            }${woodNeed > 0 ? 'WoodNeed(' + woodNeed + ') ' : ''}${
              canGatherWood && woodNeed <= 0 ? 'Wood ' : ''
            }${hasNonFullStorage ? 'Storage' : ''}`,
          ];
        },
        'Should Gather Resources',
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
                'Has Resource Source?',
                depth + 2,
              ),
              moveAndGatherAction,
            ],
            'Continue Gathering Action',
            depth + 2,
          ),
          // Branch B: Find a new resource source (with a cache).
          new Sequence(
            [
              new CachingNode(
                findResourceAction,
                BT_GATHERING_SEARCH_COOLDOWN_HOURS,
                'Cache Resource Source Search',
                depth + 3,
              ),
              moveAndGatherAction, // Once found, move and gather.
            ],
            'Find New Resource Source and Gather',
            depth + 2,
          ),
        ],
        'Perform or Start Gathering',
        depth + 1,
      ),
    ],
    'Gather Resources',
    depth,
  );
}

import { BT_CLEANUP_TREES_SEARCH_COOLDOWN_HOURS } from '../../../ai-consts';
import { HUMAN_CHOPPING_PROXIMITY } from '../../../human-consts';
import { ActionNode, ConditionNode, CachingNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { TreeEntity } from '../../../entities/plants/tree/tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { EntityId } from '../../../entities/entities-types';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING } from '../../../entities/plants/tree/states/tree-state-types';
import { Blackboard } from '../behavior-tree-blackboard';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../entities/tribe/tribe-task-utils';
import { getTribePlantingZones } from '../../../entities/tribe/tribe-food-utils';
import { isPositionInZone } from '../../../utils/spatial-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';

const BLACKBOARD_KEY = 'cleanupTreeTarget';

/**
 * Creates a behavior tree for cleaning up trees that grow on planting zones.
 * With task-based system, any adult can perform this task when needed.
 */
export function createCleanupTreesBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to find a tree inside a planting zone and store it in the blackboard.
  const findCleanupTreeAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const leader = getTribeLeaderForCoordination(human, context.gameState);
      const plantingZones = getTribePlantingZones(human, context.gameState);

      if (plantingZones.length === 0) {
        return [NodeStatus.FAILURE, 'No planting zones found'];
      }

      const indexedState = context.gameState as IndexedWorldState;
      let closestTree: TreeEntity | null = null;
      let minDistance = Infinity;

      for (const zone of plantingZones) {
        // Search for trees near the zone center.
        // The radius is half the diagonal of the zone to be safe.
        const searchRadius = Math.sqrt(zone.width * zone.width + zone.height * zone.height) / 2;
        const potentialTrees = indexedState.search.tree.byRadius(zone.position, searchRadius);

        for (const tree of potentialTrees) {
          const [state] = tree.stateMachine ?? [];
          const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;

          if (!isStanding) continue;

          // Verify the tree is actually inside the zone bounds
          if (!isPositionInZone(tree.position, zone, context.gameState)) continue;

          // Check if another tribe member is already cleaning up this tree
          if (leader && leader.aiBlackboard) {
            const taskKey = `tribal_cleanup_tree_${tree.id}`;
            const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
            if (task) {
              if (context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS) {
                if (!task.memberIds.includes(human.id)) {
                  continue;
                }
              }
            }
          }

          const distance = calculateWrappedDistance(
            human.position,
            tree.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestTree = tree;
          }
        }
      }

      if (closestTree) {
        Blackboard.set(blackboard, BLACKBOARD_KEY, closestTree.id);
        return [
          NodeStatus.SUCCESS,
          `Found nuisance tree: ${closestTree.id} at ${closestTree.position.x.toFixed(
            0,
          )},${closestTree.position.y.toFixed(0)}`,
        ];
      }
      return [NodeStatus.FAILURE, 'No nuisance trees found in planting zones'];
    },
    'Find Nuisance Tree',
    depth + 4,
  );

  // Action to move towards the tree and chop it.
  const moveAndChopAction = new TribalTaskDecorator(
    new ActionNode<HumanEntity>(
      (human, context, blackboard) => {
        const targetId = Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY);
        if (!targetId) {
          return [NodeStatus.FAILURE, 'No target in blackboard'];
        }
        const target = context.gameState.entities.entities[targetId] as TreeEntity | undefined;

        if (!target) {
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.FAILURE, 'Tree no longer exists'];
        }

        const [state] = target.stateMachine ?? [];
        const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;

        if (!isStanding) {
          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.FAILURE, 'Tree is invalid or already fallen'];
        }

        const distance = calculateWrappedDistance(
          human.position,
          target.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        if (distance < HUMAN_CHOPPING_PROXIMITY) {
          human.activeAction = 'chopping';
          human.direction = { x: 0, y: 0 };
          human.target = target.id;

          Blackboard.delete(blackboard, BLACKBOARD_KEY);
          return [NodeStatus.SUCCESS, `Chopping nuisance tree ${target.id}`];
        } else {
          human.activeAction = 'moving';
          human.target = target.id;
          human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
          return [NodeStatus.RUNNING, `Moving to nuisance tree ${target.id}`];
        }
      },
      'Move To Tree and Chop (Cleanup)',
      depth + 3,
    ),
    {
      taskType: 'cleanup_tree',
      maxCapacity: 1,
      getTargetId: (_entity, _context, blackboard) => Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY) ?? null,
    },
    'Tribal Cleanup Tree Task',
    depth + 3,
  );

  return new Sequence(
    [
      new ConditionNode(
        (human) => {
          const hasCapacity = !human.heldItem;

          return [
            human.isAdult && hasCapacity ? true : false,
            `${!hasCapacity ? 'Holding item' : 'Adult eligible'}`,
          ];
        },
        'Should Cleanup Zone?',
        depth + 1,
      ),
      new Selector(
        [
          new Sequence(
            [
              new ConditionNode(
                (_, __, blackboard) => Blackboard.has(blackboard, BLACKBOARD_KEY),
                'Has Cleanup Target?',
                depth + 2,
              ),
              moveAndChopAction,
            ],
            'Continue Cleanup Action',
            depth + 2,
          ),
          new Sequence(
            [
              new CachingNode(
                findCleanupTreeAction,
                BT_CLEANUP_TREES_SEARCH_COOLDOWN_HOURS,
                'Cache Cleanup Search',
                depth + 3,
              ),
              moveAndChopAction,
            ],
            'Find New Nuisance Tree and Chop',
            depth + 2,
          ),
        ],
        'Perform or Start Cleanup',
        depth + 1,
      ),
    ],
    'Cleanup Planting Zones',
    depth,
  );
}

import { BT_CHOPPING_SEARCH_COOLDOWN_HOURS, AI_CHOPPING_SEARCH_RADIUS } from '../../../ai-consts';
import { HUMAN_CHOPPING_PROXIMITY } from '../../../human-consts';
import { ActionNode, ConditionNode, CachingNode, Selector, Sequence, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findClosestEntity } from '../../../utils';
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
import { isWithinOperatingRange } from '../../../entities/tribe/territory-utils';
import { getTribeWoodNeed, getTribeAvailableWoodOnGround } from '../../../entities/tribe/tribe-food-utils';

const BLACKBOARD_KEY = 'treeTarget';

/**
 * Creates a behavior tree for chopping trees to get wood.
 */
export function createChoppingBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Action to find the closest tree and store it in the blackboard.
  const findTreeAction = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const leader = getTribeLeaderForCoordination(human, context.gameState);

      const closestTree = findClosestEntity<TreeEntity>(
        human,
        context.gameState,
        'tree',
        AI_CHOPPING_SEARCH_RADIUS,
        (tree) => {
          const [state] = tree.stateMachine ?? [];
          const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;

          if (!isStanding) {
            return false;
          }

          // Check if tree is within tribe's operating range
          if (human.leaderId && !isWithinOperatingRange(tree.position, human.leaderId, context.gameState)) {
            return false;
          }

          // Check if another tribe member is already chopping this tree
          if (leader && leader.aiBlackboard) {
            const taskKey = `tribal_chop_${tree.id}`;
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

      if (closestTree) {
        Blackboard.set(blackboard, BLACKBOARD_KEY, closestTree.id);
        return [
          NodeStatus.SUCCESS,
          `Found tree: ${closestTree.id} at ${closestTree.position.x.toFixed(0)},${closestTree.position.y.toFixed(0)}`,
        ];
      }
      return [NodeStatus.FAILURE, 'No tree found'];
    },
    'Find Closest Tree',
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
          return [NodeStatus.SUCCESS, `Chopping tree ${target.id}`];
        } else {
          human.activeAction = 'moving';
          human.target = target.id;
          human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
          return [NodeStatus.RUNNING, `Moving to tree ${target.id}`];
        }
      },
      'Move To Tree and Chop',
      depth + 3,
    ),
    {
      taskType: 'chop',
      maxCapacity: 1,
      getTargetId: (_entity, _context, blackboard) => Blackboard.get<EntityId>(blackboard, BLACKBOARD_KEY) ?? null,
    },
    'Tribal Chop Task',
    depth + 3,
  );

  return new Sequence(
    [
      new ConditionNode(
        (human, context) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader) return [false, 'No leader for coordination'];
          const woodNeed = getTribeWoodNeed(leader.id, context.gameState);
          if (woodNeed <= 0) return [false, 'No wood need'];

          const availableOnGround = getTribeAvailableWoodOnGround(leader.id, context.gameState);
          const shouldChopMore = woodNeed > availableOnGround;

          return [shouldChopMore, `Wood need: ${woodNeed}, Available on ground: ${availableOnGround}`];
        },
        'Need Wood?',
        depth + 1,
      ),
      new ConditionNode(
        (human) => {
          const hasCapacity = !human.heldItem;
          return [(human.isAdult && hasCapacity) ?? false, `${!hasCapacity ? 'Holding item' : 'Can chop'}`];
        },
        'Should Chop Tree',
        depth + 1,
      ),
      new Selector(
        [
          new Sequence(
            [
              new ConditionNode(
                (_, __, blackboard) => Blackboard.has(blackboard, BLACKBOARD_KEY),
                'Has Tree Target?',
                depth + 2,
              ),
              moveAndChopAction,
            ],
            'Continue Chopping Action',
            depth + 2,
          ),
          new Sequence(
            [
              new CachingNode(findTreeAction, BT_CHOPPING_SEARCH_COOLDOWN_HOURS, 'Cache Tree Search', depth + 3),
              moveAndChopAction,
            ],
            'Find New Tree and Chop',
            depth + 2,
          ),
        ],
        'Perform or Start Chopping',
        depth + 1,
      ),
    ],
    'Chop Tree',
    depth,
  );
}

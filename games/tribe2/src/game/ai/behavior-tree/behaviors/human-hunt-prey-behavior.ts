import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, CachingNode, ConditionNode, Sequence, TimeoutNode, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { getTribeCenter, findClosestEntity } from '../../../utils';
import {
  AI_HUNTING_FOOD_SEARCH_RADIUS,
  AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER,
  BT_ACTION_TIMEOUT_HOURS,
  BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
} from '../../../ai-consts.ts';
import { MAX_HUNTERS_PER_PREY } from '../../../utils/tribe-task-utils';

const HUNT_TARGET_KEY = 'huntTarget';

/**
 * Creates a behavior tree branch for humans hunting prey
 */
export function createHumanHuntPreyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const huntSequence = new Sequence(
    [
      // 1. Find a suitable prey to hunt (cached to avoid frequent searching)
      new CachingNode(
        new ConditionNode(
          (human: HumanEntity, context: UpdateContext, blackboard) => {
            if (!human.isAdult) {
              return [false, 'Not an adult'];
            }

            if (!human.leaderId) {
              return [false, 'Not in a tribe'];
            }

            const nearbyPrey = findClosestEntity<PreyEntity>(
              human.position,
              context.gameState,
              'prey',
              AI_HUNTING_FOOD_SEARCH_RADIUS,
              () => {
                // We rely on the decorator to check for task capacity later.
                return true;
              },
            );

            if (nearbyPrey) {
              Blackboard.set(blackboard, HUNT_TARGET_KEY, nearbyPrey.id);
              return [true, `Found prey`];
            }

            return [false, 'No suitable prey found'];
          },
          'Find Prey Target',
          depth + 2,
        ),
        BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
        'Cache Find Prey',
        depth + 1,
      ),

      // 2. Action: Hunt the prey (wrapped in TribalTaskDecorator)
      new TribalTaskDecorator(
        new TimeoutNode<HumanEntity>(
          new ActionNode(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              if (!human.leaderId) {
                return NodeStatus.FAILURE;
              }

              const targetId = Blackboard.get<number>(blackboard, HUNT_TARGET_KEY);
              if (!targetId) {
                return NodeStatus.FAILURE;
              }

              const target = context.gameState.entities.entities[targetId] as PreyEntity | undefined;
              if (!target || target.hitpoints <= 0) {
                // Target is dead or gone - cleanup and succeed
                Blackboard.delete(blackboard, HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.attackTargetId = undefined;
                return NodeStatus.SUCCESS;
              }

              const { gameState } = context;
              const tribeCenter = getTribeCenter(human.leaderId, gameState);
              const distanceFromCenter = calculateWrappedDistance(
                human.position,
                tribeCenter,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              // Fail if chasing too far from home
              if (distanceFromCenter > AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER) {
                Blackboard.delete(blackboard, HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.attackTargetId = undefined;
                return NodeStatus.FAILURE;
              }

              // Set hunting state
              human.activeAction = 'attacking';
              human.attackTargetId = target.id;

              // The actual hunting/attacking is handled by the interaction system
              return NodeStatus.RUNNING;
            },
            'Hunt Prey Action',
            depth + 3,
          ),
          BT_ACTION_TIMEOUT_HOURS, // Use a generous timeout
          'Hunt Prey Timeout',
          depth + 2,
        ),
        {
          taskType: 'hunt',
          maxCapacity: MAX_HUNTERS_PER_PREY,
          getTargetId: (_entity, _context, blackboard) => Blackboard.get<number>(blackboard, HUNT_TARGET_KEY) ?? null,
        },
        'Tribal Hunt Task',
        depth + 1,
      ),
    ],
    'Human Hunt Prey Sequence',
    depth,
  );

  return huntSequence;
}
